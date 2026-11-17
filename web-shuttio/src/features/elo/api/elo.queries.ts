import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"

import { api } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"
import type { PlayerSkillLevel } from "@/lib/shared"

// Đánh giá Elo ban đầu (đánh đôi). Backend là nguồn chuẩn về câu hỏi, điểm và
// trọng số: client chỉ gửi mã câu hỏi + mã đáp án và hiển thị kết quả trả về.

export type EloOptionId = "A" | "B" | "C" | "D"

export interface EloQuestion {
  id: string
  topic: string
  text: string
  description?: string
  options: { id: EloOptionId; text: string }[]
}

export interface EloQuestionnaire {
  version: string
  questions: EloQuestion[]
}

export interface EloAnswer {
  questionId: string
  optionId: EloOptionId
}

export interface EloResult {
  initialized: boolean
  elo: number | null
  label: { code: string; name: string } | null
  status: "PROVISIONAL" | "ESTABLISHED" | null
  source: "ASSESSMENT" | "DEFAULT" | null
  inconsistencyWarning: boolean
  warningMessage: string | null
  completedAt: string | null
  /** Còn được làm bảng hỏi (một lần) để thay Elo mặc định. */
  canTakeAssessment: boolean
  notice: string | null
}

/** Một lần Elo thay đổi sau khởi tạo (hiện chỉ từ đánh giá chéo ẩn danh). */
export interface EloHistoryEntry {
  reason: "PEER_RATING"
  delta: number
  eloBefore: number
  eloAfter: number
  createdAt: string
}

/** Lịch sử Elo của chính người chơi; `changes` mới nhất trước. */
export interface EloHistory {
  initialElo: number | null
  currentElo: number | null
  initializedAt: string | null
  changes: EloHistoryEntry[]
}

const BASE = "/api/elo/initial-assessment"

export const eloQueries = {
  /** Bộ câu hỏi công khai; nội dung bất biến theo version nên không cần refetch. */
  questionnaire: () =>
    queryOptions({
      queryKey: queryKeys.elo.questionnaire(),
      queryFn: ({ signal }) => api<EloQuestionnaire>(BASE, { signal }),
      staleTime: Infinity,
    }),

  /** Elo khởi tạo của người chơi (`initialized: false` cho đến khi có). */
  result: () =>
    queryOptions({
      queryKey: queryKeys.elo.result(),
      queryFn: ({ signal }) => api<EloResult>(`${BASE}/result`, { signal }),
    }),

  /** Lịch sử thay đổi Elo của chính người chơi. */
  history: () =>
    queryOptions({
      queryKey: queryKeys.elo.history(),
      queryFn: ({ signal }) => api<EloHistory>("/api/elo/history", { signal }),
    }),

  /** Trình độ công khai của người chơi khác (rỗng nếu họ chưa có Elo). */
  playerLevel: (userId: string) =>
    queryOptions({
      queryKey: queryKeys.elo.level(userId),
      queryFn: ({ signal }) =>
        api<PlayerSkillLevel[]>(
          `/api/elo/users/${encodeURIComponent(userId)}/level`,
          { signal }
        ),
    }),
}

/** Cờ cảnh báo do backend tính, để hiển thị trước khi xác nhận (không ghi gì). */
export function previewEloWarning(version: string, answers: EloAnswer[]) {
  return api<{ inconsistencyWarning: boolean; warningMessage: string | null }>(
    `${BASE}/preview`,
    { method: "POST", body: { version, answers } }
  )
}

/**
 * Gửi bảng hỏi hoặc bỏ qua. Cả hai trả về rating đã lưu: ghi thẳng vào cache và
 * làm mới các view dẫn xuất (seed, loại tài khoản) vì có rating hàm ý là player.
 */
export function useSubmitElo() {
  const queryClient = useQueryClient()
  const onSuccess = async (saved: EloResult) => {
    queryClient.setQueryData(queryKeys.elo.result(), saved)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.seed() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.account() }),
    ])
  }

  const submit = useMutation({
    mutationFn: (input: { version: string; answers: EloAnswer[] }) =>
      api<EloResult>(BASE, { method: "POST", body: input }),
    onSuccess,
  })
  return { submit }
}
