import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import type { HydratedDocument } from "mongoose"

import type { EloDiscipline } from "./elo-rating.schema.js"

/** Lý do Elo thay đổi. Hiện chỉ có đánh giá chéo sau trận. */
export type EloChangeReason = "PEER_RATING"

// Nhật ký mỗi lần Elo thay đổi sau khởi tạo — chỉ để tra cứu/hiển thị lịch sử.
// Nguồn sự thật vẫn là `elo_ratings`; bản ghi ở đây được viết SAU khi cập nhật
// rating thành công, nên có thể thiếu nếu tiến trình chết giữa chừng nhưng
// không bao giờ trùng (unique index bên dưới).
//
// Explicit `type:` trên mọi @Prop vì tsx/esbuild không emit metadata
// design:type (xem assessment.schema.ts).
@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: "elo_history",
})
export class EloChange {
  @Prop({ type: String, required: true }) userId: string
  @Prop({ type: String, required: true, enum: ["DOUBLES"] })
  discipline: EloDiscipline
  /** Trận (PlaySession) dẫn tới thay đổi này. */
  @Prop({ type: String, required: true }) sessionId: string
  @Prop({ type: String, required: true, enum: ["PEER_RATING"] })
  reason: EloChangeReason
  @Prop({ type: Number, required: true }) eloBefore: number
  @Prop({ type: Number, required: true }) eloAfter: number
  @Prop({ type: Number, required: true }) delta: number
  @Prop({ type: Number, required: true }) rdBefore: number
  @Prop({ type: Number, required: true }) rdAfter: number
  /** Số người chấm được tính — không lưu ai đã chấm (ẩn danh). */
  @Prop({ type: Number, required: true }) voters: number

  createdAt: Date
}

export type EloChangeDocument = HydratedDocument<EloChange>
export const EloChangeSchema = SchemaFactory.createForClass(EloChange)

// Mỗi trận chỉ đổi Elo của một người một lần cho mỗi lý do.
EloChangeSchema.index(
  { userId: 1, discipline: 1, sessionId: 1, reason: 1 },
  { unique: true }
)
// Lịch sử của một người, mới nhất trước.
EloChangeSchema.index({ userId: 1, createdAt: -1 })
