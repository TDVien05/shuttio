import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { EyeOff, Star } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { ratePlayer } from "@/features/chat/api/group-api"
import { eloQueries } from "@/features/elo/api/elo.queries"
import { queryKeys } from "@/lib/query-keys"
import type { ChatUser } from "@/lib/shared"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

/** Caption under the stars, by rating (1★ first). */
const STAR_WORDS = [
  m.group_info_star_words_1,
  m.group_info_star_words_2,
  m.group_info_star_words_3,
  m.group_info_star_words_4,
  m.group_info_star_words_5,
]

type SkillVote = -1 | 0 | 1

/** The optional skill vote against the player's displayed level. */
const SKILL_OPTIONS: {
  value: SkillVote
  label: () => string
  hint: () => string
}[] = [
  {
    value: -1,
    label: m.group_info_skill_lower,
    hint: m.group_info_skill_lower_hint,
  },
  {
    value: 0,
    label: m.group_info_skill_same,
    hint: m.group_info_skill_same_hint,
  },
  {
    value: 1,
    label: m.group_info_skill_higher,
    hint: m.group_info_skill_higher_hint,
  },
]

/** Mirrors the api's comment limit (`CreateRatingBodyDto`). */
const COMMENT_MAX = 300

/**
 * 1–5 stars + optional comment for a fellow player of a finished match.
 * The review is anonymous — the api never tells the ratee who sent it — and
 * the dialog says so up front. One review per player per match.
 */
export function RatePlayerDialog({
  member,
  sessionId,
  ranked = true,
  onClose,
}: {
  /** The player being rated, or null when the dialog is closed. */
  member: ChatUser | null
  sessionId: string
  /** False for a "Giao lưu" match: no skill vote, Elo stays put. */
  ranked?: boolean
  onClose: () => void
}) {
  return (
    <Dialog
      isOpen={member !== null}
      onOpenChange={(open) => !open && onClose()}
      // The form is taller than a short screen: scroll inside the dialog
      // rather than letting the top or the buttons fall off-screen.
      className="max-h-sheet-90 overflow-y-auto"
    >
      {/* Mounted per member, so every open starts from an empty form. */}
      {member ? (
        <RateForm
          key={member.id}
          member={member}
          sessionId={sessionId}
          ranked={ranked}
          onClose={onClose}
        />
      ) : null}
    </Dialog>
  )
}

function RateForm({
  member,
  sessionId,
  ranked,
  onClose,
}: {
  member: ChatUser
  sessionId: string
  ranked: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [stars, setStars] = React.useState(0)
  const [hover, setHover] = React.useState(0)
  const [comment, setComment] = React.useState("")
  const [skillVote, setSkillVote] = React.useState<SkillVote | null>(null)
  const shown = hover || stars

  // The level the skill vote is judged against — shown in the form, since
  // "stronger/weaker than the displayed level" means nothing without it.
  const {
    data: levels,
    isPending: levelLoading,
    isError: levelFailed,
  } = useQuery(eloQueries.playerLevel(member.id))
  // An unranked match takes no skill vote — same as a player with no level.
  const level = ranked ? (levels?.[0] ?? null) : null

  const rate = useMutation({
    mutationFn: () => {
      const text = comment.trim()
      return ratePlayer({
        sessionId,
        rateeId: member.id,
        stars,
        ...(text ? { comment: text } : {}),
        ...(skillVote === null || !level ? {} : { skillVote }),
      })
    },
    onSuccess: () => {
      toast.success(m.group_info_rated_toast({ name: member.name }), {
        description:
          skillVote === null || !level
            ? undefined
            : m.group_info_rated_skill_toast({ name: member.name }),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.chat.matchRatings(sessionId),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.ratings(member.id),
      })
      onClose()
    },
    onError: (err) =>
      toast.error(m.group_info_rate_failed(), {
        description: err instanceof Error ? err.message : undefined,
      }),
  })

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (stars && !rate.isPending) rate.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {m.group_info_rate_title({ name: member.name })}
        </DialogTitle>
        <DialogDescription>{m.group_info_rate_description()}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col items-center gap-2">
        <div
          role="radiogroup"
          aria-label={m.group_info_stars_label()}
          className="flex gap-1"
          onMouseLeave={() => setHover(0)}
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={stars === value}
              aria-label={m.group_info_stars_value({ count: value })}
              className="rounded-full p-1 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              onMouseEnter={() => setHover(value)}
              onClick={() => setStars(value)}
            >
              <Star
                className={cn(
                  "size-8 transition-colors",
                  value <= shown
                    ? "fill-star text-star"
                    : "text-muted-foreground/40"
                )}
              />
            </button>
          ))}
        </div>
        <p className="h-4 text-xs text-muted-foreground">
          {shown ? STAR_WORDS[shown - 1]() : m.group_info_pick_stars()}
        </p>
      </div>

      <div className="flex flex-col gap-2.5 rounded-2xl border border-border p-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <p
            id="rate-skill-label"
            className="text-sm font-semibold text-foreground"
          >
            {m.group_info_skill_label({ name: member.name })}
          </p>
          <span className="shrink-0 text-xs text-muted-foreground">
            {m.group_info_skill_optional()}
          </span>
        </div>

        {!ranked ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {m.self_court_unranked_note()}
          </p>
        ) : levelLoading ? (
          <div className="h-24 animate-pulse rounded-2xl bg-muted/50" />
        ) : !level ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {levelFailed
              ? m.group_info_skill_unavailable({ name: member.name })
              : m.group_info_skill_no_elo({ name: member.name })}
          </p>
        ) : (
          <>
            <p className="w-fit rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground tabular-nums">
              {m.group_info_skill_current({
                label: level.label.name,
                elo: level.elo,
              })}
            </p>
            <p
              id="rate-skill-question"
              className="text-sm leading-relaxed text-foreground"
            >
              {m.group_info_skill_question({ name: member.name })}
            </p>
            <div
              role="radiogroup"
              aria-labelledby="rate-skill-label"
              aria-describedby="rate-skill-question"
              className="grid grid-cols-3 gap-2"
            >
              {SKILL_OPTIONS.map((option) => {
                const selected = skillVote === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={cn(
                      "flex flex-col items-center gap-0.5 rounded-2xl border px-2 py-2 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-foreground hover:bg-muted"
                    )}
                    // Clicking the selected option again clears the vote.
                    onClick={() => setSkillVote(selected ? null : option.value)}
                  >
                    <span className="text-sm font-semibold">
                      {option.label()}
                    </span>
                    <span
                      className={cn(
                        "text-xs",
                        selected
                          ? "text-primary-foreground/80"
                          : "text-muted-foreground"
                      )}
                    >
                      {option.hint()}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {m.group_info_skill_hint({ name: member.name })}
            </p>
          </>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Textarea
          value={comment}
          maxLength={COMMENT_MAX}
          rows={3}
          placeholder={m.group_info_comment_placeholder()}
          aria-label={m.group_info_comment_placeholder()}
          onChange={(e) => setComment(e.target.value)}
        />
        <span className="self-end text-xs text-muted-foreground tabular-nums">
          {comment.length}/{COMMENT_MAX}
        </span>
      </div>

      <p className="flex items-start gap-2 rounded-2xl bg-muted/50 p-3 text-xs text-muted-foreground">
        <EyeOff className="mt-0.5 size-3.5 shrink-0" />
        <span>{m.group_info_rate_anonymous()}</span>
      </p>

      <DialogFooter>
        <Button
          shape="pill"
          variant="ghost"
          type="button"
          isDisabled={rate.isPending}
          onPress={onClose}
        >
          {m.chat_cancel()}
        </Button>
        <Button
          shape="pill"
          type="submit"
          isDisabled={!stars || rate.isPending}
        >
          {rate.isPending ? <Spinner /> : null}
          {m.group_info_submit_rating()}
        </Button>
      </DialogFooter>
    </form>
  )
}
