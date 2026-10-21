import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import type { HydratedDocument } from "mongoose"

import {
  NOTIFICATION_KINDS,
  type NotificationKind,
} from "../../shared/index.js"

// One pending email event: a notification waiting for the next digest. The
// 15-minute digest job reads these per user, sends one summary email, then
// deletes exactly the rows it summarized. Rows are the durable buffer: a failed
// send leaves them in place for the next tick.
@Schema({ timestamps: true, collection: "notificationemailevents" })
export class NotificationEmailEvent {
  @Prop({ required: true, index: true, type: String })
  userId: string

  @Prop({ required: true, enum: NOTIFICATION_KINDS, type: String })
  kind: NotificationKind

  // Who did it, for grouped lines like "Nguyễn A đã gửi 15 tin nhắn". Absent for
  // system events (booking decisions, ratings).
  @Prop({ type: String })
  actorName?: string

  @Prop({ required: true, type: String })
  text: string
}

export type NotificationEmailEventDocument =
  HydratedDocument<NotificationEmailEvent>
export const NotificationEmailEventSchema = SchemaFactory.createForClass(
  NotificationEmailEvent
)

NotificationEmailEventSchema.index({ userId: 1, createdAt: 1 })
