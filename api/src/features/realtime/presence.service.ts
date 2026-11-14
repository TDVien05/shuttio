import { Inject, Injectable, Logger } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import type { UserPresenceStatus } from "../../shared/index.js"
import { CentrifugoService } from "./centrifugo.service.js"
import {
  UserPresence,
  type UserPresenceDocument,
} from "./user-presence.schema.js"

/** Most users one presence request may ask about. */
export const PRESENCE_MAX_USERS = 50

/**
 * A stored `lastSeenAt` newer than this is left alone, so the frequent
 * presence polls cost at most one write per user per minute.
 */
export const LAST_SEEN_WRITE_INTERVAL_MS = 60_000

/**
 * Who is online, and when the others were last active.
 *
 *  - Online = the user has a live Centrifugo connection (app open in at least
 *    one tab) — asked live, never stored.
 *  - Last seen = stored, refreshed whenever the api learns the user is around:
 *    they fetched a connection token (on connect and every refresh, ≤10 min),
 *    they asked about someone's presence, or someone saw them online. So for
 *    an offline user it is accurate to within a few minutes, not to the second.
 */
@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name)

  constructor(
    @InjectModel(UserPresence.name)
    private readonly presenceModel: Model<UserPresenceDocument>,
    @Inject(CentrifugoService) private readonly centrifugo: CentrifugoService
  ) {}

  /**
   * Record that these users are around right now. Best-effort and throttled
   * (see LAST_SEEN_WRITE_INTERVAL_MS): presence must never fail the request
   * that happened to report it.
   */
  async touch(
    userIds: readonly string[],
    now: Date = new Date()
  ): Promise<void> {
    if (!userIds.length) return
    const stale = new Date(now.getTime() - LAST_SEEN_WRITE_INTERVAL_MS)
    try {
      const fresh = await this.presenceModel
        .find({ userId: { $in: userIds }, lastSeenAt: { $gt: stale } })
        .select({ userId: 1 })
        .lean()
      const skip = new Set(fresh.map((d) => d.userId))
      const due = userIds.filter((id) => !skip.has(id))
      if (!due.length) return
      await this.presenceModel.bulkWrite(
        due.map((userId) => ({
          updateOne: {
            filter: { userId },
            update: { $set: { lastSeenAt: now } },
            upsert: true,
          },
        })),
        { ordered: false }
      )
    } catch (err) {
      // Two requests can race the same upsert (E11000); the row exists either
      // way, and a missed touch is corrected by the next one.
      this.logger.debug(`presence touch skipped: ${String(err)}`)
    }
  }

  /**
   * Presence of `userIds` (deduplicated, capped at PRESENCE_MAX_USERS), as
   * seen by `viewerId` — who, by asking, is evidently around too.
   *
   * When Centrifugo can't answer, nobody is reported online; `lastSeenAt`
   * still comes from the store.
   */
  async statuses(
    viewerId: string,
    userIds: readonly string[],
    now: Date = new Date()
  ): Promise<UserPresenceStatus[]> {
    const ids = [...new Set(userIds)].slice(0, PRESENCE_MAX_USERS)
    const online = (await this.centrifugo.onlineUsers(ids)) ?? new Set<string>()
    await this.touch([...new Set([viewerId, ...online])], now)

    const offline = ids.filter((id) => !online.has(id))
    const seen = offline.length
      ? await this.presenceModel
          .find({ userId: { $in: offline } })
          .select({ userId: 1, lastSeenAt: 1 })
          .lean()
      : []
    const lastSeen = new Map(seen.map((d) => [d.userId, d.lastSeenAt]))
    return ids.map((userId) => {
      if (online.has(userId)) {
        return { userId, online: true, lastSeenAt: now.toISOString() }
      }
      const at = lastSeen.get(userId)
      return {
        userId,
        online: false,
        lastSeenAt: at ? new Date(at).toISOString() : null,
      }
    })
  }
}
