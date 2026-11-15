import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import {
  isLatLng,
  isSelfCourt,
  SELF_COST_MAX,
  vnNowIso,
  withoutExpiredRsvps,
  type BookingRecordStatus,
  type PlaySession as PlaySessionData,
  type SessionStatus,
} from "../../shared/index.js"

import {
  BookingsService,
  type BookingStatusInfo,
} from "../bookings/bookings.service.js"
import { RoomEventsService } from "../rooms/room-events.service.js"
import { PlaySession, type PlaySessionDocument } from "./session.schema.js"

const ORDER = { createdAt: 1, _id: 1 } as const

/** Largest a room's `capacity` may grow to (mirrors the web's MAX_CAPACITY). */
const MAX_CAPACITY = 8
/**
 * Most open rooms one player may host at once (mirrors the web's
 * MAX_HOSTED_ROOMS) — re-checked here as the server-side backstop since the
 * client's own cap is only a UX pre-check.
 */
const MAX_HOSTED_ROOMS = 3

/**
 * The host's client owns most of a session, but some of it only the server
 * may write: a self-booked room's attendance and settlement, its court mode
 * and ranked flag (fixed at creation), and the end state the sweeper set (a
 * stale client must not revive a room that was cancelled or settled). Copy
 * those from the stored doc over whatever the PUT body says.
 */
export function keepServerOwnedFields(
  incoming: PlaySessionData,
  prev: PlaySessionData | undefined
): PlaySessionData {
  const next: PlaySessionData = { ...incoming }
  delete next.attendance
  delete next.attendanceSettledAt
  if (next.selfCourt) {
    next.selfCourt = { ...next.selfCourt }
    delete next.selfCourt.remindedAt
    if (next.selfCourt.confirmed) next.selfCourt.confirmedAt ??= vnNowIso()
    else delete next.selfCourt.confirmedAt
  }
  // A self-booked court is never one of the app's courts.
  if (isSelfCourt(prev ?? next)) next.courtId = null
  if (!prev) return next

  if (prev.courtMode) next.courtMode = prev.courtMode
  else delete next.courtMode
  if (prev.ranked !== undefined) next.ranked = prev.ranked
  else delete next.ranked
  if (prev.attendance) next.attendance = prev.attendance
  if (prev.attendanceSettledAt) {
    next.attendanceSettledAt = prev.attendanceSettledAt
  }
  if (isSelfCourt(prev)) {
    if (prev.selfCourt) {
      const confirmed = Boolean(
        prev.selfCourt.confirmed || next.selfCourt?.confirmed
      )
      next.selfCourt = {
        ...prev.selfCourt,
        ...next.selfCourt,
        confirmed,
        ...(prev.selfCourt.confirmedAt
          ? { confirmedAt: prev.selfCourt.confirmedAt }
          : {}),
        ...(prev.selfCourt.remindedAt
          ? { remindedAt: prev.selfCourt.remindedAt }
          : {}),
      }
      if (confirmed) next.selfCourt.confirmedAt ??= vnNowIso()
    }
    if (prev.status === "cancelled" || prev.status === "completed") {
      next.status = prev.status
      next.listed = false
    }
  }
  return next
}

/** Reject a self-booked room whose advertised court is missing or malformed. */
export function assertValidSelfCourt(session: PlaySessionData): void {
  const mode: unknown = session.courtMode
  if (mode !== undefined && mode !== "app" && mode !== "self") {
    throw new BadRequestException("Hình thức đặt sân không hợp lệ")
  }
  if (mode !== "self") {
    if (session.selfCourt) {
      throw new BadRequestException("Chỉ phòng tự đặt sân mới có sân ngoài")
    }
    return
  }
  if (session.reservationId) {
    throw new BadRequestException("Phòng tự đặt sân không thể gắn đặt sân")
  }
  const c = session.selfCourt
  if (!c || typeof c !== "object") {
    throw new BadRequestException("Vui lòng nhập thông tin sân đã đặt")
  }
  const text = (v: unknown, min: number, max: number) =>
    typeof v === "string" && v.trim().length >= min && v.trim().length <= max
  if (!text(c.name, 2, 80)) {
    throw new BadRequestException("Tên sân cần từ 2 đến 80 ký tự")
  }
  if (!text(c.address, 5, 200)) {
    throw new BadRequestException("Địa chỉ sân cần từ 5 đến 200 ký tự")
  }
  if (!isLatLng({ lat: c.lat, lng: c.lng })) {
    throw new BadRequestException("Vui lòng ghim vị trí sân trên bản đồ")
  }
  if (c.courtNote !== undefined && !text(c.courtNote, 0, 80)) {
    throw new BadRequestException("Ghi chú sân tối đa 80 ký tự")
  }
  if (
    c.costPerPerson !== undefined &&
    !(
      Number.isInteger(c.costPerPerson) &&
      c.costPerPerson >= 0 &&
      c.costPerPerson <= SELF_COST_MAX
    )
  ) {
    throw new BadRequestException("Chi phí mỗi người không hợp lệ")
  }
  if (typeof c.confirmed !== "boolean") {
    throw new BadRequestException("Thiếu trạng thái chốt sân")
  }
  if (session.ranked !== undefined && typeof session.ranked !== "boolean") {
    throw new BadRequestException("Chế độ tính Elo không hợp lệ")
  }
}

/** Map a linked booking's status onto the player's session status + hold. */
function mapBookingStatus(status: BookingRecordStatus): {
  status: SessionStatus
  hold?: "confirmed" | "pending"
} {
  switch (status) {
    case "awaiting_payment":
    case "awaiting_venue_confirmation":
    case "pending":
      return { status: "booked", hold: "pending" }
    case "confirmed":
    case "checked-in":
      return { status: "booked", hold: "confirmed" }
    case "completed":
      return { status: "completed", hold: "confirmed" }
    // An unpaid hold that timed out never became a real booking — same
    // player-facing outcome as a cancel, just no refund to simulate.
    case "cancelled":
    case "no-show":
    case "expired":
    case "rejected_refund_pending":
    case "refunded":
      return { status: "cancelled" }
  }
}

// MongoDB-backed service for players' persisted PlaySessions — the durable,
// per-user mirror of the sessions a signed-in user creates or changes. Reads feed
// the seed merge (SeedService); writes are driven by the web's session actions.
//
// A booked session's status/hold/refund is *derived* at read time from its
// linked BookingRecord (see `listUserSessions`/`withBookingStatus`) rather than
// pushed onto the session doc by the venue side — the operator decision only
// ever touches the booking. Depending on BookingsService (for that read-side
// derivation) instead of VenuesService is what dissolves the old
// Sessions↔Venues forwardRef cycle.
//
// Phase 3 (VienTD-Review) demoted `PUT /api/sessions/:id` to pure room
// coordination: it used to cross-write a `booked` session straight into a
// BookingRecord (`syncBooking`/`createOrSyncAppBooking`); that now happens
// explicitly via `POST /api/bookings` (`BookingsService#createHold`,
// triggered from the web's `booking-actions.ts`), and this service just
// persists the room (roster/capacity/listing) plus whatever linkage
// (`venueId`/`reservationId`) the client already resolved from that call.
@Injectable()
export class SessionsService {
  constructor(
    @InjectModel(PlaySession.name)
    private readonly sessionModel: Model<PlaySessionDocument>,
    // Explicit token (not just the TS type) since esbuild-based runners like
    // tsx don't emit the design:paramtypes metadata Nest's implicit
    // constructor-injection would otherwise rely on — see
    // test/sessions-service.test.ts.
    @Inject(BookingsService) private readonly bookings: BookingsService,
    @Inject(RoomEventsService) private readonly roomEvents: RoomEventsService
  ) {}

  /**
   * Count of PlaySessions still live (forming a lobby or holding a court) —
   * the admin overview's "active sessions" KPI. Historical sessions
   * (completed/cancelled) don't count.
   */
  async countActive(): Promise<number> {
    return this.sessionModel.countDocuments({
      "data.status": { $in: ["forming", "booked"] },
    })
  }

  /** Every PlaySession this user has persisted + sessions they joined as a member, oldest first. */
  async listUserSessions(userId: string): Promise<PlaySessionData[]> {
    const [ownDocs, memberDocs] = await Promise.all([
      this.sessionModel.find({ userId }).sort(ORDER).lean(),
      this.sessionModel
        .find({
          userId: { $ne: userId },
          "data.roster": {
            $elemMatch: { userId, rsvp: { $in: ["going", "host"] } },
          },
        })
        .sort(ORDER)
        .lean(),
    ])
    const allDocs = [...ownDocs, ...memberDocs]
    const linkedIds = allDocs
      .map((d) => d.data.reservationId)
      .filter((id): id is string => Boolean(id))
    const statuses = await this.bookings.statusFor(linkedIds)
    const now = Date.now()
    return [
      ...ownDocs.map((d) =>
        this.withBookingStatus(withoutExpiredRsvps(d.data, now), statuses)
      ),
      ...memberDocs.map((d) => ({
        ...this.withBookingStatus(withoutExpiredRsvps(d.data, now), statuses),
        groupSession: true as const,
      })),
    ]
  }

  /**
   * Overlay a session with its linked booking's current status/hold/refund, if
   * it has one. No-ops for sessions with no linked booking (forming, or a
   * legacy record predating the bookings collection) — they keep whatever the
   * client last wrote.
   */
  private withBookingStatus(
    session: PlaySessionData,
    statuses: Map<string, BookingStatusInfo>
  ): PlaySessionData {
    const info = session.reservationId
      ? statuses.get(session.reservationId)
      : undefined
    if (!info) return session
    const mapped = mapBookingStatus(info.status)
    const next: PlaySessionData = {
      ...session,
      status: mapped.status,
      courtId: info.courtId,
      courtLabel: info.courtName,
      venueId: info.venueId,
      paymentStatus: info.paymentStatus,
      paymentExpiresAt: info.holdExpiresAt,
    }
    if (mapped.hold) next.hold = mapped.hold
    else delete next.hold
    if (info.cancelRequest) next.cancelRequest = info.cancelRequest
    else delete next.cancelRequest
    next.bookingStatus = info.status
    if (info.confirmDeadlineAt) next.confirmDeadlineAt = info.confirmDeadlineAt
    else delete next.confirmDeadlineAt
    if (info.transferMemo) next.transferMemo = info.transferMemo
    else delete next.transferMemo
    if (info.refund) {
      next.refund = {
        amount: info.refund.amount,
        status: info.refund.status,
        ...(info.refund.proofUrl ? { proofUrl: info.refund.proofUrl } : {}),
      }
    } else delete next.refund
    if (info.refundConfirmation)
      next.refundConfirmation = info.refundConfirmation
    else delete next.refundConfirmation
    if (
      info.status === "cancelled" ||
      info.status === "rejected_refund_pending" ||
      info.status === "refunded"
    ) {
      next.cancelReason = info.declineReason ?? info.cancelReason
      next.refunded =
        info.paymentStatus === "refunded" ||
        info.paymentStatus === "partial_refund"
    } else if (info.status === "no-show") {
      next.cancelReason = "Không đến (no-show)"
    }
    return next
  }

  /**
   * Insert or replace one of the user's sessions (keyed by the client id) —
   * pure room coordination (roster/capacity/listing/court-hold draft state).
   * Validates the room shape and the hosted-room cap, then strips the fields
   * a linked booking now exclusively owns before persisting.
   */
  async upsertSession(
    userId: string,
    session: PlaySessionData
  ): Promise<PlaySessionData> {
    this.assertValidRoom(session)
    const prev = await this.sessionModel
      .findOne({ userId, sessionId: session.id })
      .select({ data: 1 })
      .lean<{ data: PlaySessionData } | null>()
    if (!prev) await this.assertIdFree(userId, session.id)
    const merged = keepServerOwnedFields(session, prev?.data)
    assertValidSelfCourt(merged)
    await this.assertHostedRoomLimit(userId, merged)
    const toSave = this.stripBookingOwnedFields(merged)
    await this.sessionModel.updateOne(
      { userId, sessionId: session.id },
      { $set: { data: toSave } },
      { upsert: true }
    )
    // A listed room (new, or its capacity/roster changed) is visible to every
    // player — let them refetch now. Solo court holds stay private.
    if (toSave.listed) this.roomEvents.emit(session.id)
    return toSave
  }

  /**
   * Rooms are found by id alone across every user (joining, the room chat),
   * so a new session may not reuse an id another player already holds.
   */
  private async assertIdFree(userId: string, sessionId: string): Promise<void> {
    const taken = await this.sessionModel
      .findOne({ sessionId, userId: { $ne: userId } })
      .select({ _id: 1 })
      .lean()
    if (taken) {
      throw new ConflictException("Mã phòng đã tồn tại — hãy tạo lại phòng")
    }
  }

  /** Reject a room whose capacity or roster size breaks the shape invariants. */
  private assertValidRoom(session: PlaySessionData): void {
    if (session.capacity > MAX_CAPACITY) {
      throw new BadRequestException(
        `Room capacity cannot exceed ${MAX_CAPACITY}`
      )
    }
    if (session.roster.length > session.capacity) {
      throw new BadRequestException("Roster cannot exceed room capacity")
    }
  }

  /**
   * A room counts against the hosted-room cap while it's actively advertised
   * in the matchmaking pool — mirrors the web's `hostedRoomCount` memo
   * exactly (listed, not cancelled/completed). Solo court holds
   * (`listed: false`) are exempt, same as the client.
   */
  private isActiveHostedRoom(
    s: Pick<PlaySessionData, "listed" | "status">
  ): boolean {
    return s.listed && s.status !== "cancelled" && s.status !== "completed"
  }

  /** Reject a write that would push the user past MAX_HOSTED_ROOMS active listed rooms. */
  private async assertHostedRoomLimit(
    userId: string,
    incoming: PlaySessionData
  ): Promise<void> {
    if (!this.isActiveHostedRoom(incoming)) return
    const others = await this.sessionModel
      .find({ userId, sessionId: { $ne: incoming.id } })
      .select("data.listed data.status")
      .lean<{ data: Pick<PlaySessionData, "listed" | "status"> }[]>()
    const count = others.filter((o) => this.isActiveHostedRoom(o.data)).length
    if (count + 1 > MAX_HOSTED_ROOMS) {
      throw new ConflictException(
        `Bạn chỉ có thể mở tối đa ${MAX_HOSTED_ROOMS} phòng cùng lúc`
      )
    }
  }

  /**
   * `status`/`hold`/`cancelReason`/`refunded` are derived at read time from a
   * linked booking (`withBookingStatus`, above) once `reservationId` is set —
   * a client PUT can no longer set them directly (it could otherwise spoof a
   * venue decision it never made, or just go stale next to the real booking).
   * `status` still needs *a* value on the stored doc, so it's pinned to
   * "booked" — read-side derivation immediately refines it from the linked
   * booking's actual status. A session with no `reservationId` yet (still
   * forming, or a plain solo court-hold draft) is untouched: there's no
   * booking to derive from.
   */
  private stripBookingOwnedFields(session: PlaySessionData): PlaySessionData {
    if (!session.reservationId) return session
    const next: PlaySessionData = { ...session, status: "booked" }
    delete next.hold
    delete next.cancelReason
    delete next.refunded
    delete next.paymentStatus
    delete next.paymentExpiresAt
    return next
  }

  /** Drop one of the user's sessions; throws NotFound when nothing matched. */
  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const res = await this.sessionModel.deleteOne({ userId, sessionId })
    if (res.deletedCount === 0) throw new NotFoundException("Session not found")
    this.roomEvents.emit(sessionId)
  }
}
