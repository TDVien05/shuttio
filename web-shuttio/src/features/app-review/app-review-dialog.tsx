import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Star } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import { useAppForm } from "@/components/form"
import { cn } from "@/lib/utils"
import type { MyAppReview } from "@/lib/shared"
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
import {
  getMyAppReview,
  saveAppReview,
} from "@/features/app-review/app-review-api"
import { m } from "@/paraglide/messages"

/** Caption under the stars, by rating (1★ first). */
const LEVELS = [
  m.app_review_levels_1,
  m.app_review_levels_2,
  m.app_review_levels_3,
  m.app_review_levels_4,
  m.app_review_levels_5,
]

/** Mirrors the api's `APP_REVIEW_COMMENT_MAX` (app-reviews.dto.ts). */
const COMMENT_MAX = 500

/**
 * "Rate the app" dialog, opened from the account menus. Each user has one
 * review — opening it again loads and edits the saved one. Featured reviews
 * (4★+ with a comment) are quoted on the landing page, which the dialog says
 * up front.
 */
export function AppReviewDialog({
  open,
  onOpenChange,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Theme scope for the portaled popup (e.g. the player header's). */
  className?: string
}) {
  return (
    <Dialog isOpen={open} onOpenChange={onOpenChange} className={className}>
      <DialogHeader>
        <DialogTitle>{m.app_review_title()}</DialogTitle>
        <DialogDescription>{m.app_review_description()}</DialogDescription>
      </DialogHeader>
      {/* Mounted only while open, so every open re-reads the saved review. */}
      {open ? <ReviewForm onDone={() => onOpenChange(false)} /> : null}
    </Dialog>
  )
}

function ReviewForm({ onDone }: { onDone: () => void }) {
  const { data: existing, isPending } = useQuery({
    queryKey: ["app-reviews", "me"],
    queryFn: getMyAppReview,
    // A failed load just starts a fresh review; saving still upserts.
    retry: false,
  })

  if (isPending) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    )
  }
  return <ReviewFields existing={existing ?? null} onDone={onDone} />
}

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(COMMENT_MAX),
})

function ReviewFields({
  existing,
  onDone,
}: {
  existing: MyAppReview | null
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [hover, setHover] = React.useState(0)
  const form = useAppForm({
    defaultValues: {
      rating: existing?.rating ?? 0,
      comment: existing?.comment ?? "",
    },
    validators: { onChange: reviewSchema },
    onSubmit: async ({ value }) => {
      try {
        const saved = await saveAppReview({
          rating: value.rating,
          comment: value.comment.trim(),
        })
        queryClient.setQueryData(["app-reviews", "me"], saved)
        toast.success(existing ? m.app_review_updated() : m.app_review_thanks())
        onDone()
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : m.app_review_save_failed()
        )
      }
    },
  })

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="rating">
        {(field) => {
          const shown = hover || field.state.value
          return (
            <div className="flex flex-col items-center gap-2">
              <div
                role="radiogroup"
                aria-label={m.app_review_rating_label()}
                className="flex gap-1"
                onMouseLeave={() => setHover(0)}
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={field.state.value === value}
                    aria-label={m.app_review_star_label({ count: value })}
                    className="rounded-full p-1 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    onMouseEnter={() => setHover(value)}
                    onClick={() => field.handleChange(value)}
                  >
                    <Star
                      className={cn(
                        "size-8 transition-colors",
                        value <= shown
                          ? "fill-amber-400 text-amber-400"
                          : "text-muted-foreground/40"
                      )}
                    />
                  </button>
                ))}
              </div>
              <p className="h-4 text-xs text-muted-foreground">
                {shown ? LEVELS[shown - 1]() : m.app_review_pick_stars()}
              </p>
            </div>
          )
        }}
      </form.Field>

      <form.Field name="comment">
        {(field) => (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {m.app_review_comment_label()}
            <Textarea
              value={field.state.value}
              maxLength={COMMENT_MAX}
              rows={4}
              placeholder={m.app_review_comment_placeholder()}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
            <span className="self-end text-xs font-normal text-muted-foreground tabular-nums">
              {field.state.value.length}/{COMMENT_MAX}
            </span>
          </label>
        )}
      </form.Field>

      <p className="text-xs text-muted-foreground">
        {existing?.hidden
          ? m.app_review_hidden_notice()
          : m.app_review_public_notice()}
      </p>

      <DialogFooter>
        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting] as const}
        >
          {([canSubmit, isSubmitting]) => (
            <Button
              type="submit"
              className="rounded-full"
              isDisabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? <Spinner /> : null}
              {existing ? m.app_review_update() : m.app_review_submit()}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  )
}
