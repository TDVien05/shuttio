import { ConflictException, Injectable, Logger } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import type { Model } from "mongoose"

import { isDuplicateKeyError } from "../../common/mongo-util.js"
import type { PlayerElo, PlayerSkillLevel } from "../../shared/index.js"
import {
  EloChange,
  type EloChangeDocument,
  type EloChangeReason,
} from "./elo-change.schema.js"
import {
  EloRating,
  type EloDiscipline,
  type EloRatingDocument,
  type EloStatus,
  type QuestionSnapshot,
} from "./elo-rating.schema.js"
import {
  PEER_MIN_VOTERS,
  RD_ASSESSMENT,
  computePeerUpdate,
  inflateRd,
  initialRd,
  statusForRd,
  type WeightedVote,
} from "./peer-update.js"
import {
  INITIAL_ASSESSMENT_QUESTIONS,
  INITIAL_ASSESSMENT_VERSION,
  toPublicQuestions,
  type PublicQuestion,
} from "./initial-assessment.questions.js"
import {
  INCONSISTENCY_WARNING_MESSAGE,
  PEER_ADJUSTED_NOTICE,
  PROVISIONAL_NOTICE,
  classifyElo,
  evaluateAssessment,
  validateAnswers,
  hasInconsistencyWarning,
  levelForElo,
  type AssessmentOutcome,
  type EloLabel,
} from "./initial-assessment.scoring.js"

/** Giai đoạn này chỉ có đánh đôi. */
const DISCIPLINE: EloDiscipline = "DOUBLES"

/** Số trận gần nhất được nhớ trong `peerAppliedSessions` (chống cộng trùng). */
const APPLIED_SESSIONS_KEPT = 50
/** Số lần thử lại khi thua cuộc đua cập nhật (khoá lạc quan). */
const PEER_UPDATE_ATTEMPTS = 3
const DAY_MS = 86_400_000

/**
 * Kết quả áp đánh giá chéo của một trận vào Elo của một người:
 *  - applied: đã cập nhật (delta có thể bằng 0 — chỉ thu hẹp rd);
 *  - skipped: không bao giờ áp được (chưa có rating, chưa đủ người chấm, hoặc
 *    trận này đã được tính) — người gọi coi các phiếu là đã xử lý;
 *  - retry: thua cuộc đua cập nhật nhiều lần — để lần sweep sau thử lại.
 */
export type PeerEloOutcome =
  | {
      outcome: "applied"
      eloBefore: number
      eloAfter: number
      delta: number
      status: EloStatus
    }
  | { outcome: "skipped" }
  | { outcome: "retry" }

/** Bộ câu hỏi công khai: không note, không điểm gốc, không trọng số. */
export interface PublicAssessment {
  version: string
  questions: PublicQuestion[]
}

/** Số thay đổi gần nhất trả về cho màn hình lịch sử Elo. */
export const ELO_HISTORY_LIMIT = 50

/** Một lần Elo thay đổi, như người chơi thấy trong lịch sử của chính mình. */
export interface EloHistoryEntry {
  reason: EloChangeReason
  delta: number
  eloBefore: number
  eloAfter: number
  /** UTC ISO. */
  createdAt: string
}

/**
 * Lịch sử Elo của chính người chơi. Chỉ có điểm trước/sau và thời điểm — không
 * có trận nào, ai chấm hay bao nhiêu người chấm (đánh giá là ẩn danh).
 */
export interface EloHistory {
  /** Null khi chưa có rating. */
  initialElo: number | null
  currentElo: number | null
  /** UTC ISO; thời điểm cấp Elo khởi tạo. */
  initializedAt: string | null
  /** Mới nhất trước, tối đa `ELO_HISTORY_LIMIT`. */
  changes: EloHistoryEntry[]
}

/** Kết quả trả cho người chơi. Không chứa note/điểm gốc/trọng số. */
export interface EloResult {
  initialized: boolean
  discipline: EloDiscipline
  elo: number | null
  label: EloLabel | null
  status: EloStatus | null
  source: "ASSESSMENT" | "DEFAULT" | null
  assessmentVersion: string | null
  inconsistencyWarning: boolean
  warningMessage: string | null
  /** UTC ISO; null khi chưa hoàn tất bảng hỏi. */
  completedAt: string | null
  initializedAt: string | null
  /** Còn được làm bảng hỏi (một lần) để thay Elo mặc định hay không. */
  canTakeAssessment: boolean
  notice: string | null
}

// Dịch vụ Elo khởi tạo cho đánh đôi. Mọi thay đổi dữ liệu là MỘT thao tác
// nguyên tử có điều kiện trên document (userId, discipline) duy nhất, cộng với
// unique index, nên gửi đồng thời không thể cấp điểm hai lần hay ghi đè.
@Injectable()
export class EloService {
  private readonly logger = new Logger(EloService.name)

  constructor(
    @InjectModel(EloRating.name)
    private readonly ratings: Model<EloRatingDocument>,
    @InjectModel(EloChange.name)
    private readonly changes: Model<EloChangeDocument>
  ) {}

  /** Bộ câu hỏi công khai, đúng thứ tự định nghĩa. */
  getPublicAssessment(): PublicAssessment {
    return {
      version: INITIAL_ASSESSMENT_VERSION,
      questions: toPublicQuestions(),
    }
  }

  /**
   * Kiểm tra trước khi gửi: chỉ trả cờ cảnh báo để UI hiển thị trước khi người
   * dùng xác nhận (cờ do backend tính, thống nhất với lúc lưu). Không ghi gì.
   */
  previewWarning(version: unknown, answers: unknown) {
    const valid = validateAnswers(version, answers)
    const inconsistencyWarning = hasInconsistencyWarning(valid)
    return {
      inconsistencyWarning,
      warningMessage: inconsistencyWarning
        ? INCONSISTENCY_WARNING_MESSAGE
        : null,
    }
  }

  /** Kết quả hiện có, hoặc trạng thái chưa khởi tạo. */
  async getResult(userId: string): Promise<EloResult> {
    const doc = await this.ratings
      .findOne({ userId, discipline: DISCIPLINE })
      .lean()
    return toResult(doc)
  }

  /**
   * Elo của người chơi dưới dạng dùng chung cho dashboard (seed, tài khoản):
   * null khi chưa có rating. Có rating hàm ý vai trò người chơi.
   */
  async getPlayerElo(userId: string): Promise<PlayerElo | null> {
    const r = await this.getResult(userId)
    if (!r.initialized || r.elo === null || !r.label || !r.source) return null
    return {
      elo: r.elo,
      label: r.label,
      level: levelForElo(r.elo),
      status: r.status ?? "PROVISIONAL",
      source: r.source,
      completedAt: r.completedAt,
      canTakeAssessment: r.canTakeAssessment,
    }
  }

  /**
   * Trình độ công khai của người chơi khác, hiện trên hồ sơ: chỉ level, Elo và
   * nhãn — không có câu trả lời. Rỗng nếu họ chưa có rating.
   */
  async getPublicLevels(userId: string): Promise<PlayerSkillLevel[]> {
    const p = await this.getPlayerElo(userId)
    return p
      ? [
          {
            sport: "badminton",
            level: p.level,
            elo: p.elo,
            label: p.label,
            status: p.status,
          },
        ]
      : []
  }

  /** Lịch sử thay đổi Elo của chính người chơi, mới nhất trước. */
  async getHistory(userId: string): Promise<EloHistory> {
    const doc = await this.ratings
      .findOne({ userId, discipline: DISCIPLINE })
      .lean()
    if (!doc) {
      return {
        initialElo: null,
        currentElo: null,
        initializedAt: null,
        changes: [],
      }
    }
    const rows = await this.changes
      .find({ userId, discipline: DISCIPLINE })
      .sort({ createdAt: -1, _id: -1 })
      .limit(ELO_HISTORY_LIMIT)
      .select({ reason: 1, delta: 1, eloBefore: 1, eloAfter: 1, createdAt: 1 })
      .lean()
    return {
      initialElo: doc.initialElo,
      currentElo: doc.currentElo,
      initializedAt: doc.initializedAt.toISOString(),
      changes: rows.map((r) => ({
        reason: r.reason,
        delta: r.delta,
        eloBefore: r.eloBefore,
        eloAfter: r.eloAfter,
        createdAt: new Date(r.createdAt).toISOString(),
      })),
    }
  }

  /**
   * Hoàn tất bảng hỏi lần đầu và cấp Elo khởi tạo.
   *
   * Quy tắc (xem mục 5 của yêu cầu):
   *  - chưa có rating → tạo mới (nguồn ASSESSMENT);
   *  - đã hoàn tất + cùng payload → trả kết quả đã lưu (idempotent);
   *  - đã hoàn tất + payload khác → 409, giữ nguyên dữ liệu;
   *  - đang là DEFAULT và chưa có cập nhật rating → thay thế đúng một lần;
   *  - rating không rõ nguồn / đã có cập nhật → 409, không động vào.
   */
  async submitAssessment(
    userId: string,
    version: unknown,
    answers: unknown
  ): Promise<EloResult> {
    // Validate trước mọi truy cập DB: payload sai không bao giờ ghi gì.
    const outcome = evaluateAssessment(version, answers)
    const now = new Date()
    const fields = assessmentFields(outcome, now)

    // 1) Thử tạo mới bằng upsert + $setOnInsert: nguyên tử, nếu document đã tồn
    //    tại thì không ghi gì (upsertedCount = 0).
    if (await this.insertIfAbsent(userId, { ...fields, initializedAt: now })) {
      return this.getResult(userId)
    }

    const existing = await this.findExisting(userId)
    if (existing.source === "ASSESSMENT") {
      return this.resolveCompleted(existing, outcome)
    }

    // 2) Đang là DEFAULT: thay thế có điều kiện. Filter chứa cả source và
    //    ratingUpdateCount nên nếu giữa chừng có ai hoàn tất/cập nhật rating,
    //    thao tác không khớp và không ghi đè gì.
    if (existing.source === "DEFAULT" && existing.ratingUpdateCount === 0) {
      const res = await this.ratings.updateOne(
        {
          userId,
          discipline: DISCIPLINE,
          source: "DEFAULT",
          ratingUpdateCount: 0,
        },
        { $set: fields }
      )
      if (res.modifiedCount === 1) return this.getResult(userId)

      // Mất cuộc đua: đọc lại và quyết định theo trạng thái mới.
      const latest = await this.findExisting(userId)
      if (latest.source === "ASSESSMENT") {
        return this.resolveCompleted(latest, outcome)
      }
    }

    throw new ConflictException(
      "Không thể thay thế Elo hiện tại bằng bảng hỏi này."
    )
  }

  /**
   * Áp các phiếu kỹ năng ẩn danh của MỘT trận vào Elo của người được chấm
   * (công thức: peer-update.ts).
   *
   * Vẫn là một thao tác nguyên tử có điều kiện trên document rating: filter
   * gồm `ratingUpdateCount` đã đọc (khoá lạc quan — giá trị mới tính từ trạng
   * thái đã đọc) và `peerAppliedSessions ≠ sessionId` (một trận chỉ được tính
   * một lần, kể cả khi sweep chạy lại sau sự cố). Lịch sử (`elo_history`) ghi
   * sau, không ảnh hưởng tính đúng đắn.
   */
  async applyPeerVotes(
    userId: string,
    sessionId: string,
    votes: readonly WeightedVote[],
    now: Date = new Date(),
    /** Ngưỡng người chấm của trận này (`minVotersFor`). */
    minVoters: number = PEER_MIN_VOTERS
  ): Promise<PeerEloOutcome> {
    for (let attempt = 0; attempt < PEER_UPDATE_ATTEMPTS; attempt++) {
      const doc = await this.ratings
        .findOne({ userId, discipline: DISCIPLINE })
        .lean()
      if (!doc) return { outcome: "skipped" }
      if (doc.peerAppliedSessions?.includes(sessionId)) {
        return { outcome: "skipped" }
      }

      const cap = initialRd(doc.source)
      const idleDays = doc.lastPeerUpdateAt
        ? (now.getTime() - new Date(doc.lastPeerUpdateAt).getTime()) / DAY_MS
        : 0
      const rdBefore = inflateRd(doc.rd ?? cap, idleDays, cap)
      const next = computePeerUpdate({
        elo: doc.currentElo,
        rd: rdBefore,
        votes,
        minVoters,
      })
      if (!next) return { outcome: "skipped" }

      const rdAfter = Math.round(next.rd * 100) / 100
      const status = statusForRd(rdAfter)
      const res = await this.ratings.updateOne(
        {
          userId,
          discipline: DISCIPLINE,
          ratingUpdateCount: doc.ratingUpdateCount,
          peerAppliedSessions: { $ne: sessionId },
        },
        {
          $set: {
            currentElo: next.elo,
            rd: rdAfter,
            status,
            lastPeerUpdateAt: now,
          },
          $inc: { ratingUpdateCount: 1 },
          $push: {
            peerAppliedSessions: {
              $each: [sessionId],
              $slice: -APPLIED_SESSIONS_KEPT,
            },
          },
        }
      )
      if (res.modifiedCount !== 1) continue // thua cuộc đua: đọc lại, tính lại

      await this.recordChange({
        userId,
        discipline: DISCIPLINE,
        sessionId,
        reason: "PEER_RATING",
        eloBefore: doc.currentElo,
        eloAfter: next.elo,
        delta: next.delta,
        rdBefore: Math.round(rdBefore * 100) / 100,
        rdAfter,
        voters: next.voters,
      })
      return {
        outcome: "applied",
        eloBefore: doc.currentElo,
        eloAfter: next.elo,
        delta: next.delta,
        status,
      }
    }
    return { outcome: "retry" }
  }

  // ── nội bộ ────────────────────────────────────────────────────────────

  /** Ghi nhật ký thay đổi Elo; lỗi ở đây không được làm hỏng lần cập nhật. */
  private async recordChange(
    change: Omit<EloChange, "createdAt">
  ): Promise<void> {
    try {
      await this.changes.create(change)
    } catch (err) {
      if (isDuplicateKeyError(err)) return
      this.logger.error(
        `Không ghi được lịch sử Elo (${change.userId}, ${change.sessionId}): ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * Chèn document nếu chưa có. Trả true khi chính lời gọi này tạo ra nó.
   * Hai request đồng thời có thể cùng vượt qua upsert và đụng unique index
   * (E11000): bên thua coi như "đã tồn tại" thay vì trả 500.
   */
  private async insertIfAbsent(
    userId: string,
    doc: Omit<EloRating, "userId" | "discipline">
  ): Promise<boolean> {
    try {
      const res = await this.ratings.updateOne(
        { userId, discipline: DISCIPLINE },
        { $setOnInsert: { userId, discipline: DISCIPLINE, ...doc } },
        { upsert: true }
      )
      return res.upsertedCount === 1
    } catch (err) {
      if (isDuplicateKeyError(err)) return false
      throw err
    }
  }

  private async findExisting(userId: string): Promise<EloRating> {
    const doc = await this.ratings
      .findOne({ userId, discipline: DISCIPLINE })
      .lean()
    if (!doc) {
      // Không thể xảy ra vì không có thao tác xoá; nếu có thì báo lỗi rõ ràng.
      throw new ConflictException(
        "Trạng thái Elo đã thay đổi, vui lòng thử lại."
      )
    }
    return doc
  }

  /** Đã hoàn tất: cùng version + cùng câu trả lời → trả bản đã lưu, khác → 409. */
  private resolveCompleted(
    existing: EloRating,
    outcome: AssessmentOutcome
  ): EloResult {
    const same =
      existing.assessmentVersion === INITIAL_ASSESSMENT_VERSION &&
      JSON.stringify(existing.answers) === JSON.stringify(outcome.answers)
    if (!same) {
      throw new ConflictException(
        "Bạn đã hoàn tất đánh giá với câu trả lời khác, không thể thay đổi Elo."
      )
    }
    return toResult(existing)
  }
}

/** Các trường ghi khi hoàn tất bảng hỏi (dùng cho cả tạo mới và thay DEFAULT). */
function assessmentFields(outcome: AssessmentOutcome, now: Date) {
  const questionSnapshot: QuestionSnapshot[] = INITIAL_ASSESSMENT_QUESTIONS.map(
    (q) => ({
      id: q.id,
      text: q.text,
      weight: q.weight,
      options: q.options.map((o) => ({
        id: o.id,
        text: o.text,
        points: o.points,
      })),
    })
  )
  return {
    currentElo: outcome.elo,
    initialElo: outcome.elo,
    status: "PROVISIONAL" as const,
    rd: RD_ASSESSMENT,
    source: "ASSESSMENT" as const,
    labelCode: outcome.label.code,
    assessmentScore: outcome.rawScore,
    assessmentVersion: INITIAL_ASSESSMENT_VERSION,
    answers: outcome.answers,
    questionSnapshot,
    inconsistencyWarning: outcome.inconsistencyWarning,
    ratingUpdateCount: 0,
    completedAt: now,
  }
}

/** Chuyển document thành response công khai (cắt mọi trường nội bộ). */
function toResult(doc: EloRating | null): EloResult {
  if (!doc) {
    return {
      initialized: false,
      discipline: DISCIPLINE,
      elo: null,
      label: null,
      status: null,
      source: null,
      assessmentVersion: null,
      inconsistencyWarning: false,
      warningMessage: null,
      completedAt: null,
      initializedAt: null,
      canTakeAssessment: true,
      notice: null,
    }
  }
  return {
    initialized: true,
    discipline: doc.discipline,
    elo: doc.currentElo,
    label: classifyElo(doc.currentElo),
    status: doc.status,
    source: doc.source,
    assessmentVersion: doc.assessmentVersion,
    inconsistencyWarning: doc.inconsistencyWarning,
    warningMessage: doc.inconsistencyWarning
      ? INCONSISTENCY_WARNING_MESSAGE
      : null,
    completedAt: doc.completedAt ? doc.completedAt.toISOString() : null,
    initializedAt: doc.initializedAt.toISOString(),
    canTakeAssessment: doc.source === "DEFAULT" && doc.ratingUpdateCount === 0,
    notice:
      doc.ratingUpdateCount > 0 ? PEER_ADJUSTED_NOTICE : PROVISIONAL_NOTICE,
  }
}
