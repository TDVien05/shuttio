// Tính điểm Elo khởi tạo từ bảng hỏi tự đánh giá (đánh đôi). Toàn bộ là hàm
// thuần, không phụ thuộc DB để kiểm thử xác định.
//
// Elo ở đây chỉ là ƯỚC LƯỢNG KHỞI TẠO dựa trên tự đánh giá, chưa được xác minh
// qua trận đấu (luôn ở trạng thái PROVISIONAL). Chưa có tính điểm sau trận, hệ
// số K hay xếp hạng ở giai đoạn này.

import { BadRequestException } from "@nestjs/common"

import type { Level } from "../../shared/index.js"

import {
  INITIAL_ASSESSMENT_QUESTIONS,
  INITIAL_ASSESSMENT_VERSION,
  OPTION_IDS,
  type OptionId,
  type QuestionDefinition,
} from "./initial-assessment.questions.js"

/** Elo thấp nhất khi khởi tạo (toàn đáp án A → raw_score = 0). */
export const ELO_FLOOR = 800
/** Biên độ cộng thêm: Elo tối đa = 800 + 400 = 1200 (toàn đáp án D). */
export const ELO_SPAN = 400
/** Điểm tối đa của một đáp án (D). */
const MAX_OPTION_POINTS = 3

/**
 * max_score = 3 × (tổng trọng số) = 3 × (1+2+2+3+3+3+1) = 45. Tính từ định
 * nghĩa câu hỏi để không lệch khi đổi trọng số ở phiên bản mới.
 */
export const MAX_RAW_SCORE =
  MAX_OPTION_POINTS *
  INITIAL_ASSESSMENT_QUESTIONS.reduce((sum, q) => sum + q.weight, 0)

/** Mã nhãn trình độ tham khảo. Không chứng nhận trình độ chuyên nghiệp. */
export type EloLabelCode =
  "BEGINNER" | "BASIC" | "INTERMEDIATE" | "ADVANCED" | "HIGH"

export interface EloLabel {
  code: EloLabelCode
  name: string
}

/**
 * Bảng nhãn theo mốc dưới (inclusive), từ cao xuống thấp. Đây là cấu hình khởi
 * tạo cần kiểm chứng; miền thực tế với điểm khởi tạo chỉ là 800–1200.
 */
const LABEL_TIERS: readonly { min: number; label: EloLabel }[] = [
  { min: 1150, label: { code: "HIGH", name: "Nâng cao" } },
  { min: 1050, label: { code: "ADVANCED", name: "Khá" } },
  { min: 950, label: { code: "INTERMEDIATE", name: "Trung bình" } },
  { min: 850, label: { code: "BASIC", name: "Cơ bản" } },
]
const BEGINNER_LABEL: EloLabel = { code: "BEGINNER", name: "Mới bắt đầu" }

/** Phân loại Elo → nhãn. Cận: 849|850, 949|950, 1049|1050, 1149|1150. */
export function classifyElo(elo: number): EloLabel {
  return LABEL_TIERS.find((t) => elo >= t.min)?.label ?? BEGINNER_LABEL
}

/**
 * Nhóm trình độ thô (beginner/intermediate/advanced) cho ghép trận và bộ lọc
 * phòng, suy ra từ Elo theo nhãn: BEGINNER+BASIC → beginner (<950),
 * INTERMEDIATE → intermediate (950–1049), ADVANCED+HIGH → advanced (≥1050).
 * Là giả định sản phẩm ban đầu, cùng cấu hình với LABEL_TIERS.
 */
export function levelForElo(elo: number): Level {
  if (elo >= 1050) return "advanced"
  if (elo >= 950) return "intermediate"
  return "beginner"
}

/**
 * initial_elo = làm tròn half-up của 800 + raw_score × 400 / 45.
 *
 * Tính hoàn toàn bằng số nguyên để không dính sai số dấu phẩy động: nhân
 * TRƯỚC khi chia (raw × 400), cộng 22 (= floor(45/2)) rồi chia nguyên cho 45
 * — tương đương half-up vì mọi giá trị không âm. Với raw nguyên hợp lệ không
 * bao giờ rơi đúng nửa đơn vị. Kết quả luôn nằm trong [800, 1200]; giới hạn
 * này chỉ áp cho khởi tạo, không phải cho Elo tương lai.
 */
export function computeInitialElo(rawScore: number): number {
  if (!Number.isInteger(rawScore) || rawScore < 0 || rawScore > MAX_RAW_SCORE) {
    throw new RangeError(`raw_score ngoài khoảng 0–${MAX_RAW_SCORE}`)
  }
  const half = Math.floor(MAX_RAW_SCORE / 2)
  return ELO_FLOOR + Math.floor((rawScore * ELO_SPAN + half) / MAX_RAW_SCORE)
}

/** Một câu trả lời đã chuẩn hoá (đã qua validate). */
export interface AnswerInput {
  questionId: string
  optionId: OptionId
}

/**
 * Kiểm tra và chuẩn hoá payload gửi lên. Từ chối (400) mọi trường hợp: sai
 * version, không phải danh sách, thiếu/thừa/trùng mã câu hỏi, mục sai kiểu
 * hoặc có trường lạ, đáp án ngoài A–D. Trả danh sách theo thứ tự câu hỏi
 * (Q1→Q7) để so sánh payload ổn định giữa các lần gửi.
 *
 * Nhận `unknown` có chủ đích: không tin bất cứ điều gì từ client, kể cả khi
 * DTO đã chạy trước đó.
 */
export function validateAnswers(
  version: unknown,
  answers: unknown,
  questions: readonly QuestionDefinition[] = INITIAL_ASSESSMENT_QUESTIONS
): AnswerInput[] {
  if (version !== INITIAL_ASSESSMENT_VERSION) {
    throw new BadRequestException(
      `Phiên bản bảng hỏi không hợp lệ (cần "${INITIAL_ASSESSMENT_VERSION}").`
    )
  }
  if (!Array.isArray(answers)) {
    throw new BadRequestException("answers phải là một danh sách.")
  }

  const byQuestion = new Map<string, OptionId>()
  for (const item of answers as unknown[]) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new BadRequestException("Mỗi câu trả lời phải là một đối tượng.")
    }
    const keys = Object.keys(item)
    const { questionId, optionId } = item as Record<string, unknown>
    if (
      keys.length !== 2 ||
      typeof questionId !== "string" ||
      typeof optionId !== "string"
    ) {
      throw new BadRequestException(
        "Mỗi câu trả lời chỉ gồm questionId và optionId (chuỗi)."
      )
    }
    if (!questions.some((q) => q.id === questionId)) {
      throw new BadRequestException(`Mã câu hỏi không hợp lệ: ${questionId}.`)
    }
    if (!(OPTION_IDS as readonly string[]).includes(optionId)) {
      throw new BadRequestException(
        `Đáp án không hợp lệ cho ${questionId}: ${optionId}.`
      )
    }
    if (byQuestion.has(questionId)) {
      throw new BadRequestException(
        `Câu hỏi ${questionId} bị trả lời nhiều lần.`
      )
    }
    byQuestion.set(questionId, optionId as OptionId)
  }

  const missing = questions.filter((q) => !byQuestion.has(q.id))
  if (missing.length > 0) {
    throw new BadRequestException(
      `Thiếu câu trả lời: ${missing.map((q) => q.id).join(", ")}.`
    )
  }
  return questions.map((q) => ({
    questionId: q.id,
    optionId: byQuestion.get(q.id) as OptionId,
  }))
}

/** raw_score = Σ (điểm đáp án × trọng số câu hỏi). Nhận answers đã validate. */
export function computeRawScore(
  answers: readonly AnswerInput[],
  questions: readonly QuestionDefinition[] = INITIAL_ASSESSMENT_QUESTIONS
): number {
  return answers.reduce((sum, a) => {
    const q = questions.find((x) => x.id === a.questionId)
    const option = q?.options.find((o) => o.id === a.optionId)
    if (!q || !option) {
      throw new RangeError(`Đáp án không tồn tại: ${a.questionId}`)
    }
    return sum + option.points * q.weight
  }, 0)
}

/**
 * Cờ cảnh báo không nhất quán: Q1 = A (mới chơi) NHƯNG Q2–Q6 đều = D (kỹ năng
 * rất cao). Chỉ là cảnh báo để người dùng kiểm tra lại — KHÔNG chặn gửi, không
 * trừ điểm, không đánh dấu gian lận. Q7 cố ý không tham gia (câu bẫy trọng số 1).
 */
export function hasInconsistencyWarning(
  answers: readonly AnswerInput[]
): boolean {
  const pick = (id: string) =>
    answers.find((a) => a.questionId === id)?.optionId
  return (
    pick("Q1") === "A" &&
    ["Q2", "Q3", "Q4", "Q5", "Q6"].every((id) => pick(id) === "D")
  )
}

export const INCONSISTENCY_WARNING_MESSAGE =
  "Bạn vừa chọn mức kỹ năng khá cao so với thời gian chơi. Hãy kiểm tra lại để được ghép trận phù hợp."

/** Thông báo luôn đi kèm điểm: nhấn mạnh đây chưa phải điểm đã xác minh. */
export const PROVISIONAL_NOTICE =
  "Đây là điểm khởi tạo từ tự đánh giá, chưa được xác minh qua trận đấu."

/** Kết quả tính toán từ một bộ câu trả lời hợp lệ. */
export interface AssessmentOutcome {
  answers: AnswerInput[]
  rawScore: number
  elo: number
  label: EloLabel
  inconsistencyWarning: boolean
}

/** Validate + tính điểm trọn gói. Backend tự tính, không nhận điểm từ client. */
export function evaluateAssessment(
  version: unknown,
  answers: unknown
): AssessmentOutcome {
  const valid = validateAnswers(version, answers)
  const rawScore = computeRawScore(valid)
  const elo = computeInitialElo(rawScore)
  return {
    answers: valid,
    rawScore,
    elo,
    label: classifyElo(elo),
    inconsistencyWarning: hasInconsistencyWarning(valid),
  }
}
