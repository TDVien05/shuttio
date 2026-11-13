import * as React from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
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
  onClose,
}: {
  /** The player being rated, or null when the dialog is closed. */
  member: ChatUser | null
  sessionId: string
  onClose: () => void
}) {
  return (
    <Dialog
      isOpen={member !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      {/* Mounted per member, so every open starts from an empty form. */}
      {member ? (
        <RateForm
          key={member.id}
          member={member}
          sessionId={sessionId}
          onClose={onClose}
        />
      ) : null}
    </Dialog>
  )
}

function RateForm({
  member,
  sessionId,
  onClose,
}: {
  member: ChatUser
  sessionId: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [stars, setStars] = React.useState(0)
  const [hover, setHover] = React.useState(0)
  const [comment, setComment] = React.useState("")
  const shown = hover || stars

  const rate = useMutation({
    mutationFn: () => {
      const text = comment.trim()
      return ratePlayer({
        sessionId,
        rateeId: member.id,
        stars,
        ...(text ? { comment: text } : {}),
      })
    },
    onSuccess: () => {
      toast.success(m.group_info_rated_toast({ name: member.name }))
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
