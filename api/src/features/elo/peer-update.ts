// Cập nhật Elo từ đánh giá chéo ẩn danh sau trận (đánh đôi). Toàn bộ là hàm
// thuần, không phụ thuộc DB để kiểm thử xác định.
//
// Mô hình: trình độ thật là ẩn số có phân phối chuẩn N(elo, rd²) — `rd` (rating
// deviation, kiểu Glicko) là độ bất định của ước lượng. Mỗi phiếu "yếu hơn /
// đúng mức / mạnh hơn mức hiển thị" là một quan sát nhiễu về trình độ ấy, lệch
// `PEER_STEP_ELO` so với Elo hiện tại, với nhiễu `PEER_VOTE_SIGMA`. Gộp các
// phiếu của một trận bằng cập nhật Bayes (Kalman một chiều):
//
//   S    = Σ(w·v) / Σw                    (tín hiệu đồng thuận, −1…+1)
//   g    = rd² / (rd² + σ² / Σw)          (hệ số tin vào phiếu, 0…1)
//   elo' = elo + clamp(g · STEP · S)
//   rd'  = max(RD_FLOOR, rd · √(1 − g))
//
// Hệ quả: người mới (rd lớn) đổi điểm nhanh, người đã ổn định (rd nhỏ) đổi
// chậm — không cần hệ số K chỉnh tay. Phiếu "đúng mức" không đổi điểm nhưng
// vẫn thu hẹp rd (xác nhận ước lượng hiện tại).
//
// Mọi hằng số dưới đây là cấu hình ban đầu cần kiểm chứng bằng dữ liệu thật.

import type { EloSource, EloStatus } from "./elo-rating.schema.js"

/** Phiếu kỹ năng: −1 yếu hơn, 0 đúng mức, +1 mạnh hơn mức đang hiển thị. */
export type SkillVote = -1 | 0 | 1
export const SKILL_VOTES: readonly SkillVote[] = [-1, 0, 1]

/** Một phiếu đã gắn trọng số của người chấm. */
export interface WeightedVote {
  vote: SkillVote
  weight: number
}

/** Cần ít nhất chừng này người chấm trong một trận (ẩn danh + giảm nhiễu). */
export const PEER_MIN_VOTERS = 2

/**
 * Ngưỡng người chấm theo số người thực sự chơi trận. Trận chỉ có 2 người thì
 * mỗi người chỉ có thể nhận một phiếu (và vốn không ẩn danh được), nên một
 * phiếu là đủ — công thức tự cho mức thay đổi nhỏ hơn khi ít phiếu.
 */
export function minVotersFor(participants: number): number {
  return participants <= 2 ? 1 : PEER_MIN_VOTERS
}
/** Một bậc lệch ("mạnh hơn"/"yếu hơn") tương ứng bao nhiêu Elo. */
export const PEER_STEP_ELO = 100
/** Độ nhiễu (độ lệch chuẩn, theo Elo) của một phiếu đơn lẻ. */
export const PEER_VOTE_SIGMA = 300
/** Trần thay đổi Elo cho một trận, chống đột biến/thao túng. */
export const PEER_MAX_DELTA = 50

/** rd khởi tạo: bảng hỏi đáng tin hơn điểm mặc định 1000. */
export const RD_ASSESSMENT = 150
export const RD_DEFAULT = 250
/** rd không bao giờ xuống dưới mức này, để điểm không "đóng băng". */
export const RD_FLOOR = 50
/** rd ≤ mức này thì Elo được coi là đã ổn định (ESTABLISHED). */
export const RD_ESTABLISHED = 90
/** Lâu không được chấm thì rd nở lại: rd² += RD_DRIFT² × số ngày. */
export const RD_DRIFT = 10

/** Trọng số tối thiểu của một người chấm. */
const MIN_RATER_WEIGHT = 0.25

export function initialRd(source: EloSource): number {
  return source === "ASSESSMENT" ? RD_ASSESSMENT : RD_DEFAULT
}

export function statusForRd(rd: number): EloStatus {
  return rd <= RD_ESTABLISHED ? "ESTABLISHED" : "PROVISIONAL"
}

/**
 * Trọng số của một người chấm theo số lần họ ĐÃ chấm kỹ năng cho chính người
 * này ở các trận trước: 1, 1/2, 1/3… (sàn 0.25). Một cặp chấm nhau lặp lại
 * không thể đẩy điểm mãi — hạn chế bơm/dìm điểm theo nhóm.
 */
export function raterWeight(priorVotesForRatee: number): number {
  return Math.max(MIN_RATER_WEIGHT, 1 / (1 + Math.max(0, priorVotesForRatee)))
}

/** rd sau `days` ngày không có cập nhật, không vượt quá `cap` (rd khởi tạo). */
export function inflateRd(rd: number, days: number, cap: number): number {
  if (!(days > 0)) return rd
  // Không bao giờ làm GIẢM rd, kể cả khi rd đang lớn hơn cap.
  return Math.max(rd, Math.min(cap, Math.sqrt(rd * rd + RD_DRIFT ** 2 * days)))
}

export interface PeerUpdate {
  elo: number
  rd: number
  /** elo mới − elo cũ (số nguyên, đã qua trần). */
  delta: number
  /** Tín hiệu đồng thuận −1…+1. */
  signal: number
  /** Hệ số tin vào phiếu 0…1. */
  gain: number
  voters: number
}

/**
 * Gộp các phiếu của MỘT trận thành một lần cập nhật. Trả null khi chưa đủ
 * `minVoters` người chấm (mặc định `PEER_MIN_VOTERS`) — không đổi điểm, không
 * đổi rd.
 */
export function computePeerUpdate(input: {
  elo: number
  rd: number
  votes: readonly WeightedVote[]
  minVoters?: number
}): PeerUpdate | null {
  const votes = input.votes.filter((v) => v.weight > 0)
  if (votes.length < (input.minVoters ?? PEER_MIN_VOTERS)) return null

  const totalWeight = votes.reduce((sum, v) => sum + v.weight, 0)
  const signal =
    votes.reduce((sum, v) => sum + v.weight * v.vote, 0) / totalWeight
  const variance = input.rd * input.rd
  const gain = variance / (variance + PEER_VOTE_SIGMA ** 2 / totalWeight)
  const raw = gain * PEER_STEP_ELO * signal
  const delta = Math.round(
    Math.max(-PEER_MAX_DELTA, Math.min(PEER_MAX_DELTA, raw))
  )
  return {
    elo: input.elo + delta,
    rd: Math.max(RD_FLOOR, input.rd * Math.sqrt(1 - gain)),
    delta,
    signal,
    gain,
    voters: votes.length,
  }
}
