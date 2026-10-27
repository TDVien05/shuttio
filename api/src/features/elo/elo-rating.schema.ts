import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { Schema as MongooseSchema, type HydratedDocument } from "mongoose"

import type { OptionId } from "./initial-assessment.questions.js"
import type { EloLabelCode } from "./initial-assessment.scoring.js"

/** Môn/nội dung thi đấu được chấm Elo. Hiện chỉ có đánh đôi. */
export type EloDiscipline = "DOUBLES"
/** Elo khởi tạo luôn tạm thời; chưa có cơ chế xác minh qua trận đấu. */
export type EloStatus = "PROVISIONAL"
/**
 * Nguồn của Elo hiện tại:
 *  - ASSESSMENT: tính từ bảng hỏi (đã hoàn tất, KHÔNG làm lại được).
 *  - DEFAULT: mặc định 1000 của người dùng cũ từng chọn "Bỏ qua" (nay không còn
 *    cách tạo mới: làm bảng hỏi là bắt buộc; họ được làm bảng hỏi
 *    thay thế đúng một lần nếu chưa có cập nhật rating nào).
 */
export type EloSource = "ASSESSMENT" | "DEFAULT"

/** Snapshot bất biến của một câu hỏi tại thời điểm trả lời (không có note). */
export interface QuestionSnapshot {
  id: string
  text: string
  weight: number
  options: { id: OptionId; text: string; points: number }[]
}

// Rating Elo của một người chơi cho một nội dung thi đấu. Đúng MỘT document cho
// mỗi (userId, discipline) — ràng buộc unique bên dưới là chốt chặn cuối cùng
// để hai request đồng thời không thể cấp điểm hai lần. Mọi thay đổi đều là
// một thao tác cập nhật nguyên tử có điều kiện trên đúng document này nên
// không cần transaction nhiều document.
//
// Explicit `type:` trên mọi @Prop vì tsx/esbuild không emit metadata
// design:type (xem assessment.schema.ts).
@Schema({ timestamps: true, minimize: false, collection: "elo_ratings" })
export class EloRating {
  /** Clerk user id, lấy từ phiên xác thực — không bao giờ từ body client. */
  @Prop({ type: String, required: true }) userId: string
  @Prop({ type: String, required: true, enum: ["DOUBLES"] })
  discipline: EloDiscipline
  /** Elo hiện tại; ban đầu bằng `initialElo`. Giai đoạn này chưa ai sửa nó. */
  @Prop({ type: Number, required: true }) currentElo: number
  /** Elo lúc khởi tạo (800–1200 từ bảng hỏi, hoặc 1000 mặc định). */
  @Prop({ type: Number, required: true }) initialElo: number
  @Prop({ type: String, required: true, enum: ["PROVISIONAL"] })
  status: EloStatus
  @Prop({ type: String, required: true, enum: ["ASSESSMENT", "DEFAULT"] })
  source: EloSource
  /** Mã nhãn tại thời điểm khởi tạo (BEGINNER…HIGH). */
  @Prop({ type: String, required: true }) labelCode: EloLabelCode
  /** raw_score 0–45; null khi source = DEFAULT (không tạo điểm giả). */
  @Prop({ type: Number, default: null }) assessmentScore: number | null
  /** Phiên bản bảng hỏi đã dùng; null khi DEFAULT. */
  @Prop({ type: String, default: null }) assessmentVersion: string | null
  /** Câu trả lời đã chuẩn hoá (Q1→Q7); null khi DEFAULT. */
  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  answers: { questionId: string; optionId: OptionId }[] | null
  /** Snapshot câu hỏi/đáp án/trọng số để diễn giải dữ liệu sau này. */
  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  questionSnapshot: QuestionSnapshot[] | null
  /** Cờ cảnh báo không nhất quán (chỉ thông tin, không ảnh hưởng điểm). */
  @Prop({ type: Boolean, default: false }) inconsistencyWarning: boolean
  /**
   * Số lần rating đã bị cập nhật bởi hoạt động khác (trận đấu…). Hiện luôn 0;
   * hệ thống trận đấu tương lai phải tăng trường này. Điều kiện "chưa có cập
   * nhật nào" để thay Elo mặc định dựa vào nó.
   */
  @Prop({ type: Number, required: true, default: 0 }) ratingUpdateCount: number
  /** Thời điểm hoàn tất bảng hỏi (UTC); null khi vẫn đang ở Elo mặc định cũ. */
  @Prop({ type: Date, default: null }) completedAt: Date | null
  /** Thời điểm tạo rating lần đầu (UTC). */
  @Prop({ type: Date, required: true }) initializedAt: Date
}

export type EloRatingDocument = HydratedDocument<EloRating>
export const EloRatingSchema = SchemaFactory.createForClass(EloRating)

// Một rating cho mỗi người chơi trên mỗi discipline.
EloRatingSchema.index({ userId: 1, discipline: 1 }, { unique: true })
