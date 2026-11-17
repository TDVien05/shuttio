import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Cron } from "@nestjs/schedule"
import type { Model } from "mongoose"

import {
  attendanceClosesAt,
  attendedIds,
  checkInWindow,
  isLatLng,
  isSelfCourt,
  metersBetween,
  seatHolderIds,
  SELF_CHECKIN_RADIUS_M,
  SELF_COURT_CONFIRM_DEADLINE_MS,
  SELF_COURT_REMIND_BEFORE_MS,
  sessionEndMsOf,
  sessionStartMsOf,
  vnNowIso,
  type AttendanceMark,
  type PlaySession as PlaySessionData,
} from "../../shared/index.js"
import { NotificationsService } from "../notifications/notifications.service.js"
import { ReliabilityService } from "../reliability/reliability.service.js"
import {
  PlaySession,
  type PlaySessionDocument,
} from "../sessions/session.schema.js"
import { RoomEventsService } from "./room-events.service.js"

/** GPS readings worse than this (metres) are refused rather than trusted. */
const MAX_GPS_ACCURACY_M = 150

/**
 * A settled match needs at least this many confirmed attendees before the
 * absent seat holders are recorded as no-shows: with fewer, nobody can tell
 * a match that was skipped by everyone from one nobody logged in the app.
 */
const MIN_ATTENDEES_TO_SETTLE = 2

/** Rooms handled per sweep; the rest wait for the next tick. */
const SWEEP_LIMIT = 200

export interface SelfCourtSweepResult {
  reminded: number
  cancelled: number
  settled: number
}

type SweepRoom = Pick<PlaySessionDocument, "_id" | "userId" | "sessionId"> & {
  data: PlaySessionData
}

const vnTime = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
})

/**
 * Self-booked rooms (`courtMode: "self"`): the host books a court directly
 * with a venue that isn't on the app, players meet through the room, then
 * rate each other. Without a venue to vouch for the match, this service
 * establishes who actually played:
 *
 * - the host marks the court as booked ("Đã chốt sân"); an unconfirmed room
 *   is reminded 6h before and cancelled 2h before the start, so nobody
 *   travels to a court that was never booked;
 * - each seat holder checks in on site by GPS (30 min before the start until
 *   the end, within {@link SELF_CHECKIN_RADIUS_M} m of the pinned court), or
 *   is vouched for by a player who did, until 24h after the end;
 * - 24h after the end the sweep settles the room: attendees get an
 *   `attended` record, absent seat holders a `no_show` (only once at least
 *   two attendees prove the match happened), and the room is completed.
 *
 * Only confirmed attendees may rate each other (`sessionParticipantIds`).
 */
@Injectable()
export class SelfCourtService {
  private readonly logger = new Logger(SelfCourtService.name)
  private running = false

  constructor(
    @InjectModel(PlaySession.name)
    private readonly sessionModel: Model<PlaySessionDocument>,
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
    @Inject(ReliabilityService)
    private readonly reliability: ReliabilityService,
    @Inject(RoomEventsService) private readonly events: RoomEventsService
  ) {}

  /** `ownerId`: prefer the host's own copy when legacy ids collide. */
  private async findSelfRoom(
    roomId: string,
    ownerId?: string
  ): Promise<PlaySessionDocument> {
    const own = ownerId
      ? await this.sessionModel.findOne({ sessionId: roomId, userId: ownerId })
      : null
    const doc = own ?? (await this.sessionModel.findOne({ sessionId: roomId }))
    if (!doc) throw new NotFoundException("Phòng không tồn tại")
    if (!isSelfCourt(doc.data)) {
      throw new BadRequestException("Phòng này đặt sân qua ứng dụng")
    }
    if (doc.data.status === "cancelled") {
      throw new ConflictException("Phòng đã bị huỷ")
    }
    return doc
  }

  /** The host says the court is booked with the venue. Idempotent. */
  async confirmCourt(hostUserId: string, roomId: string): Promise<void> {
    const doc = await this.findSelfRoom(roomId, hostUserId)
    if (doc.userId !== hostUserId) {
      throw new ForbiddenException("Chỉ chủ phòng mới có quyền chốt sân")
    }
    if (doc.data.selfCourt?.confirmed) return
    if (doc.data.status === "completed") {
      throw new ConflictException("Trận đã kết thúc")
    }
    await this.sessionModel.updateOne(
      { _id: doc._id },
      {
        $set: {
          "data.selfCourt.confirmed": true,
          "data.selfCourt.confirmedAt": vnNowIso(),
        },
      }
    )
    this.events.emit(roomId)
    await this.notifyAll(
      seatHolderIds(doc.userId, doc.data).filter((id) => id !== hostUserId),
      (id) => ({
        id: `self-court-confirmed-${roomId}-${id}`,
        kind: "match",
        text: `Chủ phòng đã chốt sân cho "${doc.data.title}" tại ${doc.data.selfCourt?.name ?? doc.data.venue}.`,
        href: "/app/play",
      })
    )
  }

  /** A seat holder checks in on site, measured against the pinned court. */
  async checkIn(
    userId: string,
    roomId: string,
    position: { lat: number; lng: number; accuracy?: number },
    now: number = Date.now()
  ): Promise<AttendanceMark> {
    const doc = await this.findSelfRoom(roomId)
    const room = doc.data
    if (!seatHolderIds(doc.userId, room).includes(userId)) {
      throw new ForbiddenException("Bạn không có chỗ trong phòng này")
    }
    const existing = room.attendance?.[userId]
    if (existing?.via === "gps") return existing
    if (room.attendanceSettledAt || room.status === "completed") {
      throw new ConflictException("Đã hết thời gian check-in")
    }
    const window = checkInWindow(room)
    if (!window) throw new ConflictException("Phòng chưa có giờ chơi")
    if (now < window.opensAt) {
      throw new ConflictException(
        `Check-in mở lúc ${vnTime.format(new Date(window.opensAt))} (30 phút trước giờ chơi)`
      )
    }
    if (now > window.closesAt) {
      throw new ConflictException(
        "Đã hết giờ check-in — nhờ người chơi đã có mặt xác nhận giúp bạn"
      )
    }
    const court = room.selfCourt
    if (!court || !isLatLng({ lat: court.lat, lng: court.lng })) {
      throw new ConflictException("Phòng chưa ghim vị trí sân")
    }
    if (!isLatLng(position)) {
      throw new BadRequestException("Vị trí không hợp lệ")
    }
    if (
      position.accuracy !== undefined &&
      position.accuracy > MAX_GPS_ACCURACY_M
    ) {
      throw new BadRequestException(
        "Tín hiệu GPS chưa đủ chính xác — hãy bật định vị chính xác và thử lại"
      )
    }
    const meters = metersBetween(position, { lat: court.lat!, lng: court.lng! })
    if (meters > SELF_CHECKIN_RADIUS_M) {
      throw new BadRequestException(
        `Bạn đang cách sân khoảng ${formatDistance(meters)} — cần ở trong phạm vi ${SELF_CHECKIN_RADIUS_M} m để check-in`
      )
    }
    const mark: AttendanceMark = { at: new Date(now).toISOString(), via: "gps" }
    await this.sessionModel.updateOne(
      { _id: doc._id },
      { $set: { [`data.attendance.${userId}`]: mark } }
    )
    this.events.emit(roomId)
    return mark
  }

  /**
   * A player who is confirmed present vouches for another seat holder whose
   * check-in failed (no GPS, flat battery…), from the start until 24h after
   * the end.
   */
  async vouch(
    userId: string,
    roomId: string,
    targetUserId: string,
    now: number = Date.now()
  ): Promise<void> {
    const doc = await this.findSelfRoom(roomId)
    const room = doc.data
    if (userId === targetUserId) {
      throw new BadRequestException("Hãy tự check-in tại sân")
    }
    if (!room.attendance?.[userId]) {
      throw new ForbiddenException(
        "Bạn cần check-in trước khi xác nhận cho người khác"
      )
    }
    if (!seatHolderIds(doc.userId, room).includes(targetUserId)) {
      throw new NotFoundException("Người này không có chỗ trong phòng")
    }
    if (room.attendance?.[targetUserId]) return
    if (room.attendanceSettledAt || room.status === "completed") {
      throw new ConflictException("Đã hết thời gian xác nhận có mặt")
    }
    const start = sessionStartMsOf(room)
    const closes = attendanceClosesAt(room)
    if (start === null || closes === null || now < start) {
      throw new ConflictException("Chỉ xác nhận được sau khi trận bắt đầu")
    }
    if (now > closes) {
      throw new ConflictException("Đã hết thời gian xác nhận có mặt")
    }
    const mark: AttendanceMark = {
      at: new Date(now).toISOString(),
      via: "vouch",
      by: userId,
    }
    await this.sessionModel.updateOne(
      { _id: doc._id },
      { $set: { [`data.attendance.${targetUserId}`]: mark } }
    )
    this.events.emit(roomId)
  }

  @Cron("*/5 * * * *", { name: "self-court-sweep" })
  async runScheduled(): Promise<void> {
    try {
      const r = await this.sweep()
      if (r.reminded || r.cancelled || r.settled) {
        this.logger.log(
          `Self-court sweep: ${r.reminded} reminded, ${r.cancelled} cancelled, ${r.settled} settled`
        )
      }
    } catch (err) {
      this.logger.error(
        `Self-court sweep failed: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /** One pass: remind, cancel unconfirmed rooms, settle finished ones. */
  async sweep(now: number = Date.now()): Promise<SelfCourtSweepResult> {
    const result: SelfCourtSweepResult = {
      reminded: 0,
      cancelled: 0,
      settled: 0,
    }
    if (this.running) return result
    this.running = true
    try {
      const rooms = await this.sessionModel
        .find({
          "data.courtMode": "self",
          "data.status": { $in: ["forming", "booked"] },
          "data.attendanceSettledAt": { $exists: false },
        })
        .limit(SWEEP_LIMIT)
        .lean<SweepRoom[]>()
      for (const room of rooms) {
        try {
          const step = await this.sweepRoom(room, now)
          if (step) result[step] += 1
        } catch (err) {
          this.logger.error(
            `Self-court sweep of room ${room.sessionId} failed: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      }
      return result
    } finally {
      this.running = false
    }
  }

  private async sweepRoom(
    room: SweepRoom,
    now: number
  ): Promise<keyof SelfCourtSweepResult | null> {
    const data = room.data
    const start = sessionStartMsOf(data)
    const end = sessionEndMsOf(data)
    if (start === null || end === null) return null
    const confirmed = Boolean(data.selfCourt?.confirmed)

    if (!confirmed) {
      if (now >= start - SELF_COURT_CONFIRM_DEADLINE_MS) {
        await this.cancelUnconfirmed(room)
        return "cancelled"
      }
      if (
        now >= start - SELF_COURT_REMIND_BEFORE_MS &&
        !data.selfCourt?.remindedAt
      ) {
        await this.sessionModel.updateOne(
          { _id: room._id },
          { $set: { "data.selfCourt.remindedAt": vnNowIso() } }
        )
        await this.notifyAll([room.userId], () => ({
          id: `self-court-remind-${room.sessionId}`,
          kind: "match",
          text: `Phòng "${data.title}" chưa chốt sân. Hãy bấm "Đã chốt sân" trước ${vnTime.format(new Date(start - SELF_COURT_CONFIRM_DEADLINE_MS))}, nếu không phòng sẽ tự huỷ.`,
          href: "/app/play",
        }))
        return "reminded"
      }
      return null
    }

    const closes = attendanceClosesAt(data)
    if (closes !== null && now >= closes) {
      await this.settle(room, end)
      return "settled"
    }
    return null
  }

  /** Cancel a room whose host never confirmed the court. */
  private async cancelUnconfirmed(room: SweepRoom): Promise<void> {
    const res = await this.sessionModel.updateOne(
      { _id: room._id, "data.status": { $in: ["forming", "booked"] } },
      { $set: { "data.status": "cancelled", "data.listed": false } }
    )
    if (res.modifiedCount === 0) return
    this.events.emit(room.sessionId)
    const members = seatHolderIds(room.userId, room.data).filter(
      (id) => id !== room.userId
    )
    // Players already counted on this match: failing them is on the host.
    if (members.length) {
      await this.reliability.record(room.userId, room.sessionId, "late_cancel")
    }
    await this.notifyAll(members, (id) => ({
      id: `self-court-cancelled-${room.sessionId}-${id}`,
      kind: "match",
      text: `Phòng "${room.data.title}" đã tự huỷ vì chủ phòng chưa chốt sân trước giờ chơi 2 tiếng.`,
      href: "/app/play",
    }))
    await this.notifyAll([room.userId], () => ({
      id: `self-court-cancelled-host-${room.sessionId}`,
      kind: "match",
      text: `Phòng "${room.data.title}" đã tự huỷ vì chưa được chốt sân trước giờ chơi 2 tiếng.`,
      href: "/app/play",
    }))
  }

  /** Record who showed up, then close the room. */
  private async settle(room: SweepRoom, endMs: number): Promise<void> {
    const seats = seatHolderIds(room.userId, room.data)
    const attended = new Set(attendedIds(room.userId, room.data))
    const at = new Date(endMs)
    const verified = attended.size >= MIN_ATTENDEES_TO_SETTLE
    for (const id of seats) {
      if (attended.has(id)) {
        await this.reliability.record(id, room.sessionId, "attended", at)
      } else if (verified) {
        await this.reliability.record(id, room.sessionId, "no_show", at)
      }
    }
    await this.sessionModel.updateOne(
      { _id: room._id },
      {
        $set: {
          "data.status": "completed",
          "data.listed": false,
          "data.attendanceSettledAt": vnNowIso(),
        },
      }
    )
    this.events.emit(room.sessionId)
    if (!verified) return
    await this.notifyAll(
      seats.filter((id) => !attended.has(id)),
      (id) => ({
        id: `self-court-no-show-${room.sessionId}-${id}`,
        kind: "match",
        text: `Bạn được ghi nhận vắng mặt ở trận "${room.data.title}" vì không check-in. Vắng mặt nhiều lần sẽ tạm khoá việc tham gia phòng mới.`,
        href: "/app/play",
      })
    )
  }

  private async notifyAll(
    userIds: string[],
    build: (id: string) => Parameters<NotificationsService["create"]>[1]
  ): Promise<void> {
    await Promise.all(
      userIds.map((id) =>
        this.notifications.create(id, build(id)).catch((err: unknown) => {
          this.logger.error(
            `Self-court notification to ${id} failed`,
            err instanceof Error ? err.stack : String(err)
          )
        })
      )
    )
  }
}

function formatDistance(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1).replace(".", ",")} km`
    : `${Math.round(meters)} m`
}
