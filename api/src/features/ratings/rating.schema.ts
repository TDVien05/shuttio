import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import type { HydratedDocument } from "mongoose"

// A peer review one player leaves another after a match they both played.
// One per (rater, ratee, session) — enforced by the unique index below.
// Reviews are anonymous: `raterId` exists only to enforce that uniqueness and
// to tell the rater who they already rated. It is never sent to the ratee or
// shown on a profile, and no rater display name is stored.
// Explicit `type:` on every @Prop for the same reason as session.schema.ts
// (tsx/esbuild don't emit the design:type metadata @Prop() infers from).
@Schema({ timestamps: true })
export class Rating {
  /** Clerk id of the player leaving the review — never exposed to others. */
  @Prop({ required: true, type: String }) raterId: string
  /** Clerk id of the player being reviewed. */
  @Prop({ required: true, index: true, type: String }) rateeId: string
  /** The PlaySession (match) both played in. */
  @Prop({ required: true, type: String }) sessionId: string
  @Prop({ required: true, type: Number, min: 1, max: 5 }) stars: number
  @Prop({ type: String }) comment?: string
  /**
   * Optional skill vote, separate from the stars (which mostly reflect how
   * pleasant the match was): −1 weaker than / 0 matches / +1 stronger than
   * the ratee's displayed level. Feeds the ratee's Elo (`PeerEloService`).
   */
  @Prop({ type: Number, enum: [-1, 0, 1] }) skillVote?: number
  /**
   * Set while the skill vote still waits for the Elo sweep; unset once the
   * sweep handled it (applied or discarded). Sparse-indexed below.
   */
  @Prop({ type: Boolean }) eloPending?: boolean
  /** When the Elo sweep handled this vote. */
  @Prop({ type: Date }) eloProcessedAt?: Date

  createdAt: Date
}

export type RatingDocument = HydratedDocument<Rating>
export const RatingSchema = SchemaFactory.createForClass(Rating)

RatingSchema.index({ raterId: 1, rateeId: 1, sessionId: 1 }, { unique: true })
// Profile summary: a ratee's newest reviews first.
RatingSchema.index({ rateeId: 1, createdAt: -1 })
// The Elo sweep's queue: only ratings with an unprocessed skill vote.
RatingSchema.index({ eloPending: 1, createdAt: 1 }, { sparse: true })
