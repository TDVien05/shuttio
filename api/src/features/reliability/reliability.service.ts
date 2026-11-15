import { ForbiddenException, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import {
  NO_SHOW_RESTRICT_DAYS,
  NO_SHOW_STRIKE_DAYS,
  NO_SHOW_STRIKES,
  RELIABILITY_WINDOW_DAYS,
  reliabilityScore,
  type ReliabilitySummary,
} from "../../shared/index.js"
import {
  ReliabilityEvent,
  type ReliabilityEventDocument,
  type ReliabilityKind,
} from "./reliability-event.schema.js"

const DAY_MS = 24 * 60 * 60_000

/** Mongo duplicate-key error code (the unique user/session/kind index). */
const DUPLICATE_KEY = 11000

/**
 * Whether players keep the seats they take. Self-booked rooms have no venue
 * to vouch for them, so a show-up record is what lets a host judge a stranger
 * asking to join. No-shows and late cancels are counted apart (a no-show
 * leaves the others a player short with no warning; a late cancel at least
 * warns them), and repeat no-shows block joining for a while rather than
 * banning the account.
 */
@Injectable()
export class ReliabilityService {
  constructor(
    @InjectModel(ReliabilityEvent.name)
    private readonly eventModel: Model<ReliabilityEventDocument>
  ) {}

  /** Record one fact; a repeat for the same (player, match, kind) is a no-op. */
  async record(
    userId: string,
    sessionId: string,
    kind: ReliabilityKind,
    at: Date = new Date()
  ): Promise<void> {
    try {
      await this.eventModel.create({ userId, sessionId, kind, at })
    } catch (err) {
      if ((err as { code?: number }).code === DUPLICATE_KEY) return
      throw err
    }
  }

  /** A player's record over the last {@link RELIABILITY_WINDOW_DAYS} days. */
  async summary(
    userId: string,
    now: Date = new Date()
  ): Promise<ReliabilitySummary> {
    const since = new Date(now.getTime() - RELIABILITY_WINDOW_DAYS * DAY_MS)
    const events = await this.eventModel
      .find({ userId, at: { $gte: since } })
      .select({ kind: 1, at: 1 })
      .lean<{ kind: ReliabilityKind; at: Date }[]>()
    const counts = { attended: 0, noShows: 0, lateCancels: 0 }
    for (const e of events) {
      if (e.kind === "attended") counts.attended += 1
      else if (e.kind === "no_show") counts.noShows += 1
      else counts.lateCancels += 1
    }
    return {
      userId,
      ...counts,
      score: reliabilityScore(counts),
      restrictedUntil: restrictedUntil(
        events.filter((e) => e.kind === "no_show").map((e) => e.at),
        now
      ),
      windowDays: RELIABILITY_WINDOW_DAYS,
    }
  }

  /** Throw when the player is temporarily barred from joining rooms. */
  async assertCanJoin(userId: string, now: Date = new Date()): Promise<void> {
    const since = new Date(now.getTime() - NO_SHOW_STRIKE_DAYS * DAY_MS)
    const noShows = await this.eventModel
      .find({ userId, kind: "no_show", at: { $gte: since } })
      .select({ at: 1 })
      .lean<{ at: Date }[]>()
    const until = restrictedUntil(
      noShows.map((e) => e.at),
      now
    )
    if (!until) return
    const date = new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(until))
    throw new ForbiddenException(
      `Bạn đã vắng mặt ${NO_SHOW_STRIKES} trận trở lên trong ${NO_SHOW_STRIKE_DAYS} ngày qua nên tạm thời chưa thể tham gia phòng mới (đến ${date}).`
    )
  }
}

/**
 * {@link NO_SHOW_STRIKES} no-shows within {@link NO_SHOW_STRIKE_DAYS} days
 * block joining for {@link NO_SHOW_RESTRICT_DAYS} days after the latest one.
 */
export function restrictedUntil(noShowsAt: Date[], now: Date): string | null {
  const since = now.getTime() - NO_SHOW_STRIKE_DAYS * DAY_MS
  const recent = noShowsAt
    .map((d) => d.getTime())
    .filter((t) => t >= since)
    .sort((a, b) => b - a)
  if (recent.length < NO_SHOW_STRIKES) return null
  const until = recent[0] + NO_SHOW_RESTRICT_DAYS * DAY_MS
  return until > now.getTime() ? new Date(until).toISOString() : null
}
