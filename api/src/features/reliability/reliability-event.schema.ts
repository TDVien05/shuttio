import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import type { HydratedDocument } from "mongoose"

export const RELIABILITY_KINDS = ["attended", "no_show", "late_cancel"] as const
export type ReliabilityKind = (typeof RELIABILITY_KINDS)[number]

// One fact about whether a player kept a seat they held: they showed up,
// never showed up, or gave the seat up shortly before the start. At most one
// of each kind per (player, match) — the unique index makes recording
// idempotent, so a retried sweep never double-counts.
@Schema({ timestamps: true })
export class ReliabilityEvent {
  @Prop({ required: true, type: String }) userId: string
  /** The PlaySession (match) the seat was in. */
  @Prop({ required: true, type: String }) sessionId: string
  @Prop({ required: true, type: String, enum: RELIABILITY_KINDS })
  kind: ReliabilityKind
  /** When it happened (the match end for attendance, the leave for a cancel). */
  @Prop({ required: true, type: Date }) at: Date
}

export type ReliabilityEventDocument = HydratedDocument<ReliabilityEvent>
export const ReliabilityEventSchema =
  SchemaFactory.createForClass(ReliabilityEvent)

ReliabilityEventSchema.index(
  { userId: 1, sessionId: 1, kind: 1 },
  { unique: true }
)
// The summary reads one player's recent history.
ReliabilityEventSchema.index({ userId: 1, at: -1 })
