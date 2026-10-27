import { useRouter } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import * as React from "react"
import { ArrowRight, TriangleAlert } from "lucide-react"

import { LogoMark } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { AccountType } from "@/lib/shared"
import { useChooseAccountType } from "@/features/onboarding/api/account-api"
import {
  eloQueries,
  previewEloWarning,
  useSubmitElo,
} from "@/features/elo/api/elo.queries"
import type {
  EloAnswer,
  EloOptionId,
  EloQuestion,
  EloResult,
} from "@/features/elo/api/elo.queries"
import { m } from "@/paraglide/messages"

type Draft = Partial<Record<string, EloOptionId>>

/**
 * Đánh giá Elo ban đầu (đánh đôi) — thay cho bảng đánh giá kỹ năng cũ ở bước
 * ngay sau khi tạo tài khoản. Nội dung câu hỏi, điểm và nhãn đều do backend trả
 * về; màn hình này chỉ thu thập đáp án, hiển thị cảnh báo (không chặn gửi) và
 * kết quả. Elo chỉ là ước lượng khởi tạo, luôn ghi rõ là chưa xác minh.
 */
export function EloAssessmentView({
  accountType = null,
  nextPath = "/app",
}: {
  accountType?: AccountType | null
  /** Nơi CTA hoàn tất dẫn tới — `/setup` khi còn nợ bước tạo địa điểm. */
  nextPath?: string
}) {
  const router = useRouter()
  const {
    data: questionnaire,
    isPending,
    isError,
    refetch,
  } = useQuery(eloQueries.questionnaire())
  const { data: existing } = useQuery(eloQueries.result())
  const { submit } = useSubmitElo()
  const chooseAccountType = useChooseAccountType()

  const [draft, setDraft] = React.useState<Draft>({})
  const [showMissing, setShowMissing] = React.useState(false)
  // Cảnh báo không nhất quán đang chờ người dùng xác nhận gửi.
  const [pendingWarning, setPendingWarning] = React.useState<string | null>(
    null
  )
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  // Kết quả vừa hoàn tất trong phiên này (hoặc rating đã khoá từ trước).
  const [completed, setCompleted] = React.useState<EloResult | null>(null)

  const questions = questionnaire?.questions ?? []
  const answeredCount = questions.filter((q) => draft[q.id]).length
  const progress = questions.length
    ? (answeredCount / questions.length) * 100
    : 0

  // Đã hoàn tất bảng hỏi từ trước: không làm lại được, chỉ xem kết quả.
  const locked = existing?.initialized && !existing.canTakeAssessment
  const shown = completed ?? (locked ? existing : null)

  const select = (questionId: string, optionId: EloOptionId) => {
    setShowMissing(false)
    setPendingWarning(null)
    setError(null)
    setDraft((prev) => ({ ...prev, [questionId]: optionId }))
  }

  /** Có rating hàm ý là player; tài khoản chỉ-venue cần thành "both". */
  const finish = async (result: EloResult) => {
    if (accountType === "venue") {
      await chooseAccountType.mutateAsync("both")
    }
    setCompleted(result)
  }

  const run = async (action: () => Promise<EloResult>) => {
    setBusy(true)
    setError(null)
    try {
      await finish(await action())
    } catch (err) {
      setError(err instanceof ApiError ? err.message : m.elo_error_generic())
    } finally {
      setBusy(false)
    }
  }

  // Chỉ gọi khi đã trả lời đủ; câu chưa chọn bị bỏ qua thay vì ép kiểu.
  const buildAnswers = (): EloAnswer[] =>
    questions.flatMap((q) => {
      const optionId = draft[q.id]
      return optionId ? [{ questionId: q.id, optionId }] : []
    })

  const send = () => {
    if (!questionnaire) return
    void run(() =>
      submit.mutateAsync({
        version: questionnaire.version,
        answers: buildAnswers(),
      })
    )
  }

  const onComplete = async () => {
    if (!questionnaire || busy) return
    if (answeredCount < questions.length) {
      setShowMissing(true)
      return
    }
    // Đã thấy cảnh báo và bấm lại: gửi luôn, cảnh báo không chặn.
    if (pendingWarning) return send()

    setBusy(true)
    setError(null)
    try {
      const check = await previewEloWarning(
        questionnaire.version,
        buildAnswers()
      )
      if (check.inconsistencyWarning) {
        setPendingWarning(check.warningMessage ?? m.elo_warning_fallback())
        return
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : m.elo_error_generic())
      return
    } finally {
      setBusy(false)
    }
    send()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-stage-glow">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 py-6 sm:px-6 sm:py-10">
          {shown ? (
            <ResultScreen
              result={shown}
              cta={
                nextPath === "/setup"
                  ? m.assessment_complete_cta_setup()
                  : m.assessment_complete_cta()
              }
              onEnter={() =>
                void router.navigate({ href: nextPath, replace: true })
              }
            />
          ) : (
            <>
              <header className="flex flex-col gap-5">
                <div className="min-w-0">
                  <h1 className="font-heading text-xl font-bold sm:text-2xl">
                    {m.elo_title()}
                  </h1>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {m.elo_subtitle()}
                  </span>
                  {existing?.initialized && existing.canTakeAssessment ? (
                    <p className="mt-2 rounded-2xl border border-brand/30 bg-brand/10 p-3 text-sm">
                      {m.elo_default_notice({ elo: existing.elo ?? 0 })}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-end text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      {m.assessment_progress_answered({
                        answered: answeredCount,
                        total: questions.length,
                      })}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand to-lime transition-width duration-500 ease-out"
                      style={{ width: `${Math.max(progress, 4)}%` }}
                    />
                  </div>
                </div>
              </header>

              <main className="mt-7 flex-1">
                {isPending ? (
                  <p className="text-sm text-muted-foreground">
                    {m.assessment_loading_title()}
                  </p>
                ) : isError ? (
                  <div className="flex flex-col items-start gap-3">
                    <p className="text-sm text-destructive">
                      {m.elo_error_load()}
                    </p>
                    <Button
                      shape="pill"
                      type="button"
                      onPress={() => void refetch()}
                    >
                      {m.assessment_load_error_retry()}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-5">
                    {questions.map((question, index) => (
                      <QuestionCard
                        key={question.id}
                        index={index}
                        question={question}
                        selected={draft[question.id]}
                        missing={showMissing && !draft[question.id]}
                        onSelect={(optionId) => select(question.id, optionId)}
                      />
                    ))}
                  </div>
                )}
              </main>

              {pendingWarning ? (
                <div
                  role="alert"
                  className="mt-6 flex items-start gap-3 rounded-2xl border border-warn-line/40 bg-warn-line/10 p-4 text-sm"
                >
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn-ink" />
                  <div className="flex flex-col gap-1">
                    <p>{pendingWarning}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.elo_warning_hint()}
                    </p>
                  </div>
                </div>
              ) : null}
              {error ? (
                <p role="alert" className="mt-4 text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              {/* Bắt buộc: không có nút bỏ qua, người chơi phải hoàn thành để vào hệ thống. */}
              <footer className="mt-8 flex items-center justify-end gap-3 border-t pt-5">
                <Button
                  shape="pill"
                  type="button"
                  isDisabled={busy || !questionnaire}
                  onPress={() => void onComplete()}
                >
                  {pendingWarning
                    ? m.elo_submit_anyway()
                    : m.assessment_actions_complete()}
                </Button>
              </footer>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function QuestionCard({
  index,
  question,
  selected,
  missing,
  onSelect,
}: {
  index: number
  question: EloQuestion
  selected: EloOptionId | undefined
  missing: boolean
  onSelect: (optionId: EloOptionId) => void
}) {
  return (
    <fieldset
      className={cn(
        "rounded-3xl border p-4 transition-colors sm:p-5",
        missing
          ? "border-destructive/45 bg-destructive/5"
          : "border-border bg-card/70"
      )}
    >
      <legend className="flex items-baseline gap-2 px-1 font-heading font-semibold">
        <span className="text-brand tabular-nums">{index + 1}.</span>
        <span>{question.text}</span>
      </legend>
      {question.description ? (
        <p className="mt-1 px-1 text-xs text-muted-foreground">
          {question.description}
        </p>
      ) : null}
      <div className="mt-3 grid gap-2">
        {question.options.map((option) => {
          const isSelected = selected === option.id
          return (
            <label
              key={option.id}
              className={cn(
                "relative flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-all duration-200",
                isSelected
                  ? "border-brand/50 bg-brand/10 shadow-sm"
                  : "border-border bg-background hover:border-brand/30 hover:bg-muted/50"
              )}
            >
              <input
                type="radio"
                name={question.id}
                value={option.id}
                className="sr-only"
                checked={isSelected}
                onChange={() => onSelect(option.id)}
              />
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border text-xs font-bold transition-colors",
                  isSelected
                    ? "border-brand bg-brand text-white"
                    : "border-border bg-card text-muted-foreground"
                )}
              >
                {option.id}
              </span>
              <span className="min-w-0 pt-0.5 text-sm leading-relaxed">
                {option.text}
              </span>
            </label>
          )
        })}
      </div>
      {missing ? (
        <p className="mt-2 text-sm text-destructive">
          {m.assessment_validation_missing_answer()}
        </p>
      ) : null}
    </fieldset>
  )
}

function ResultScreen({
  result,
  cta,
  onEnter,
}: {
  result: EloResult
  cta: string
  onEnter: () => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
      <LogoMark className="size-16 text-primary" />
      <h1 className="mt-6 font-heading text-2xl font-bold sm:text-3xl">
        {m.assessment_complete_title()}
      </h1>

      <div className="mt-8 w-full rounded-3xl border border-brand/20 bg-card/80 p-6 shadow-sm backdrop-blur-sm">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">
          {m.elo_result_label()}
        </p>
        <p className="mt-1 font-heading text-5xl font-bold tabular-nums">
          {result.elo}
        </p>
        <p className="mt-2 text-lg font-semibold">{result.label?.name}</p>
        <span className="mt-3 inline-block rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          {m.elo_provisional_badge()}
        </span>
        {result.source === "DEFAULT" ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {m.elo_default_result_hint()}
          </p>
        ) : null}
        {result.warningMessage ? (
          <p className="mt-3 text-sm text-warn-ink">{result.warningMessage}</p>
        ) : null}
      </div>
      {result.notice ? (
        <p className="mt-4 max-w-md text-sm text-muted-foreground">
          {result.notice}
        </p>
      ) : null}

      <Button
        shape="pill"
        type="button"
        size="lg"
        className="mt-10"
        onPress={onEnter}
      >
        {cta}
        <ArrowRight className="size-4" />
      </Button>
    </div>
  )
}
