import { Inject, Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { InjectModel } from "@nestjs/mongoose"
import { Cron } from "@nestjs/schedule"
import type { Model, Types } from "mongoose"

import { EloService } from "../elo/elo.service.js"
import {
  PEER_MIN_VOTERS,
  minVotersFor,
  raterWeight,
  type SkillVote,
} from "../elo/peer-update.js"
import { NotificationsService } from "../notifications/notifications.service.js"
import { sessionParticipantIds } from "../rooms/group-match.js"
import {
  PlaySession,
  type PlaySessionDocument,
} from "../sessions/session.schema.js"
import { Rating, type RatingDocument } from "./rating.schema.js"

/**
 * How long a match's skill votes are collected before they move the ratee's
 * Elo, counted from the first vote that ratee received for that match.
 * Batching keeps the votes anonymous: the ratee sees one combined change, not
 * a change right after each teammate rated. This is the default; the
 * `PEER_VOTE_WINDOW_MINUTES` env var overrides it (dev/testing).
 */
export const PEER_VOTE_WINDOW_MS = 24 * 60 * 60 * 1000

/** (match, ratee) batches handled per run; the rest wait for the next tick. */
const BATCHES_PER_RUN = 200

export interface PeerEloRunResult {
  /** Batches that updated an Elo rating. */
  applied: number
  /** Batches discarded: too few voters, no rating yet, or match already counted. */
  skipped: number
  /** Batches left queued for the next run. */
  deferred: number
}

interface PendingBatch {
  _id: { sessionId: string; rateeId: string }
}

interface PendingVote {
  _id: Types.ObjectId
  raterId: string
  skillVote: SkillVote
}

/**
 * Turns anonymous post-match skill votes into Elo updates. Every 15 minutes
 * it takes each (match, ratee) batch whose collection window has closed,
 * weights the voters, and hands the batch to `EloService.applyPeerVotes`
 * (which is idempotent per match). Votes are the queue: they are marked
 * handled only after the Elo step answered, so a crash mid-run just retries.
 *
 * A vote that arrives after its match was already counted is discarded on a
 * later run — one Elo change per player per match.
 */
@Injectable()
export class PeerEloService {
  private readonly logger = new Logger(PeerEloService.name)
  private running = false

  constructor(
    @InjectModel(Rating.name)
    private readonly ratingModel: Model<RatingDocument>,
    @InjectModel(PlaySession.name)
    private readonly sessionModel: Model<PlaySessionDocument>,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(EloService) private readonly elo: EloService,
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService
  ) {}

  @Cron("*/15 * * * *", { name: "peer-elo" })
  async runScheduled(): Promise<void> {
    try {
      const result = await this.run()
      if (result.applied || result.deferred) {
        this.logger.log(
          `Peer Elo: ${result.applied} applied, ${result.skipped} skipped, ${result.deferred} deferred`
        )
      }
    } catch (err) {
      this.logger.error(
        `Peer Elo run failed: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /** One pass over every closed batch. Public for tests and manual runs. */
  async run(now: Date = new Date()): Promise<PeerEloRunResult> {
    const result: PeerEloRunResult = { applied: 0, skipped: 0, deferred: 0 }
    if (this.running) return result
    this.running = true
    try {
      const cutoff = new Date(now.getTime() - this.windowMs())
      const batches = await this.ratingModel.aggregate<PendingBatch>([
        { $match: { eloPending: true } },
        {
          $group: {
            _id: { sessionId: "$sessionId", rateeId: "$rateeId" },
            firstVoteAt: { $min: "$createdAt" },
          },
        },
        { $match: { firstVoteAt: { $lte: cutoff } } },
        { $sort: { firstVoteAt: 1 } },
        { $limit: BATCHES_PER_RUN },
      ])
      for (const batch of batches) {
        try {
          result[
            await this.applyBatch(batch._id.sessionId, batch._id.rateeId, now)
          ] += 1
        } catch (err) {
          // One bad batch must not block the rest; it stays queued.
          result.deferred += 1
          this.logger.error(
            `Peer Elo batch ${batch._id.sessionId} failed: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      }
      return result
    } finally {
      this.running = false
    }
  }

  /** The collection window: `PEER_VOTE_WINDOW_MINUTES`, else 24 hours. */
  private windowMs(): number {
    const minutes = this.config.get<number>("PEER_VOTE_WINDOW_MINUTES")
    return minutes ? minutes * 60_000 : PEER_VOTE_WINDOW_MS
  }

  /**
   * Voters a player needs in this match: one in a two-player match (each can
   * only be rated by the other), otherwise the usual minimum. A match that
   * can no longer be found keeps the usual minimum.
   */
  private async minVoters(sessionId: string): Promise<number> {
    const doc = await this.sessionModel
      .findOne({ sessionId })
      .sort({ createdAt: 1, _id: 1 })
      .lean<PlaySessionDocument>()
    if (!doc) return PEER_MIN_VOTERS
    return minVotersFor(sessionParticipantIds(doc.userId, doc.data).length)
  }

  private async applyBatch(
    sessionId: string,
    rateeId: string,
    now: Date
  ): Promise<keyof PeerEloRunResult> {
    const votes = await this.ratingModel
      .find({ sessionId, rateeId, eloPending: true })
      .select({ raterId: 1, skillVote: 1 })
      .lean<PendingVote[]>()
    if (!votes.length) return "skipped"

    // Earlier, already-handled skill votes each rater gave this same player:
    // a pair that keeps rating each other counts for less every time.
    const prior = await this.ratingModel.aggregate<{
      _id: string
      count: number
    }>([
      {
        $match: {
          rateeId,
          raterId: { $in: votes.map((v) => v.raterId) },
          skillVote: { $exists: true },
          eloPending: { $ne: true },
        },
      },
      { $group: { _id: "$raterId", count: { $sum: 1 } } },
    ])
    const priorByRater = new Map(prior.map((p) => [p._id, p.count]))

    const outcome = await this.elo.applyPeerVotes(
      rateeId,
      sessionId,
      votes.map((v) => ({
        vote: v.skillVote,
        weight: raterWeight(priorByRater.get(v.raterId) ?? 0),
      })),
      now,
      await this.minVoters(sessionId)
    )
    if (outcome.outcome === "retry") return "deferred"

    await this.ratingModel.updateMany(
      { _id: { $in: votes.map((v) => v._id) } },
      { $unset: { eloPending: 1 }, $set: { eloProcessedAt: now } }
    )
    if (outcome.outcome === "skipped") return "skipped"

    if (outcome.delta !== 0) {
      const sign = outcome.delta > 0 ? "+" : "−"
      await this.notifications.create(rateeId, {
        // Deterministic per (match, ratee), so a retried run never notifies
        // twice — and, like the review notification, it names no rater.
        id: `elo-peer-${sessionId}-${rateeId}`,
        kind: "rating",
        text: `Elo của bạn thay đổi ${sign}${Math.abs(outcome.delta)} (${outcome.eloBefore} → ${outcome.eloAfter}) theo đánh giá ẩn danh từ những người chơi cùng.`,
      })
    }
    return "applied"
  }
}
