import { useLocation, useRouter } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { EyeOff, RotateCcw, Star } from "lucide-react"
import { initialsOf } from "@/lib/shared"
import { relativeTime } from "@/lib/relative-time"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"

import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuthUser } from "@/features/dashboard/hooks/use-auth-user"
import { useData } from "@/features/dashboard/components/data-provider"
import { eloQueries } from "@/features/elo/api/elo.queries"
import { profileQueries } from "@/features/dashboard/api/profile.queries"
import { usePlayerIdentity } from "@/features/play/hooks/use-player-identity"
import { LevelChip, SportDot } from "@/features/dashboard/components/shared"
import { ELO_ASSESSMENT_PATH } from "@/features/elo/lib/elo"
import { m } from "@/paraglide/messages"

const sportsMessages = {
  badminton: m.common_sports_badminton,
} as const

interface ProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProfileDialog({ open, onOpenChange }: ProfileDialogProps) {
  const sUser = useAuthUser()
  const router = useRouter()
  const { userName } = usePlayerIdentity()
  const { user: USER, elo } = useData()

  const accountName = sUser.name || userName
  const accountSubtitle = sUser.email || USER.handle
  const accountImage = sUser.image || undefined
  const accountInitials = sUser.name ? initialsOf(sUser.name) : USER.initials

  const handleDisplay = accountSubtitle.includes("@")
    ? accountSubtitle
    : `@${accountSubtitle}`

  const bio = m.profile_bio()

  return (
    <Dialog
      isOpen={open}
      onOpenChange={onOpenChange}
      className="flex max-h-sheet-90 max-w-page-width flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
    >
      <DialogHeader className="sr-only">
        <DialogTitle>{m.sidebar_profile()}</DialogTitle>
        <DialogDescription>{m.profile_dialog_description()}</DialogDescription>
      </DialogHeader>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div
          className="bg-court-lines relative h-32 w-full shrink-0 bg-linear-to-br from-brand via-lime/60 to-chart-3 sm:h-36"
          aria-hidden="true"
        >
          {/* Overlay to blend gradient nicely */}
          <div className="absolute inset-0 bg-black/5" />
        </div>

        <div className="relative flex flex-col px-6 pt-0 pb-6 sm:px-8 sm:pb-8">
          <div className="relative -mt-10 mb-3 w-fit">
            <Avatar className="size-20 border-4 border-popover bg-secondary shadow-md">
              {accountImage ? (
                <AvatarImage src={accountImage} alt={accountName} />
              ) : null}
              <AvatarFallback tone="secondary" size="lg" weight="bold">
                {accountInitials}
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="flex flex-col gap-0.5">
            <h3 className="font-heading text-xl leading-tight font-bold text-foreground">
              {accountName}
            </h3>
            <p className="text-xs text-muted-foreground">{handleDisplay}</p>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            {bio}
          </p>

          <div className="mt-5 flex flex-col gap-3">
            <h4 className="font-mono text-micro font-bold tracking-wider text-muted-foreground uppercase">
              {m.profile_your_level()}
            </h4>
            <div className="grid grid-cols-1 gap-3">
              <div className="group relative flex flex-col gap-2 overflow-hidden rounded-2xl border border-chart-3/20 bg-chart-3/5 p-3.5">
                <div className="absolute -right-3 -bottom-3 size-12 rounded-full bg-chart-3/10 blur-md transition-transform duration-300 group-hover:scale-125" />
                <div className="z-10 flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-chart-3" />
                  <span className="font-mono text-mini font-semibold tracking-wider text-chart-3 uppercase">
                    {m.common_sports_badminton()}
                  </span>
                </div>
                <div className="z-10 mt-1">
                  <p className="font-heading text-base leading-tight font-bold text-foreground">
                    {elo ? elo.label.name : m.profile_not_assessed()}
                  </p>
                  <p className="mt-0.5 text-micro text-muted-foreground tabular-nums">
                    {m.profile_elo({ elo: elo?.elo ?? 0 })}
                  </p>
                </div>
              </div>
            </div>

            {/* Elo khởi tạo chỉ làm bảng hỏi được một lần, để thay Elo mặc định. */}
            {elo?.canTakeAssessment ? (
              <Button
                shape="pill"
                variant="outline"
                size="sm"
                className="w-full"
                onPress={() => {
                  onOpenChange(false)
                  void router.navigate({ href: ELO_ASSESSMENT_PATH })
                }}
              >
                <RotateCcw className="size-4" />
                {m.profile_redo_skills()}
              </Button>
            ) : null}
          </div>

          <PlayerReviews userId={sUser.id} open={open} />
        </div>
      </div>
    </Dialog>
  )
}

interface PlayerProfileDialogProps {
  initials: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * What the caller already knows about a real (non-seed) player, e.g. a room
   * member — their display name, and their Clerk id for peer reviews.
   */
  member?: { name: string; userId?: string } | null
}

export function PlayerProfileDialog({
  initials,
  open,
  onOpenChange,
  member,
}: PlayerProfileDialogProps) {
  const { players, playerByInitials } = useData()
  const pathname = useLocation({ select: (l) => l.pathname })
  const playScope = pathname === "/app/play"

  const fullPlayer = initials
    ? players.find((p) => p.initials === initials)
    : null
  const rosterEntry = initials ? playerByInitials(initials) : null

  const name =
    fullPlayer?.name || member?.name || rosterEntry?.name || initials || ""
  const level = fullPlayer?.level ?? rosterEntry?.level
  const sport = fullPlayer?.sport
  const matchPct = fullPlayer?.matchPct
  const distanceKm = fullPlayer?.distanceKm
  const online = fullPlayer?.online
  const blurb = fullPlayer?.blurb

  return (
    <Dialog
      isOpen={open}
      onOpenChange={onOpenChange}
      className={cn(
        "flex max-h-sheet-90 max-w-page-width flex-col gap-0 overflow-hidden p-0 sm:max-w-md",
        playScope && "player-play-overlay"
      )}
    >
      <DialogHeader className="sr-only">
        <DialogTitle>{m.profile_view_profile()}</DialogTitle>
        <DialogDescription>
          {m.profile_player_dialog_description()}
        </DialogDescription>
      </DialogHeader>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div
          className="bg-court-lines relative h-32 w-full shrink-0 bg-linear-to-br from-brand via-lime/60 to-chart-3 sm:h-36"
          aria-hidden="true"
        >
          <div className="absolute inset-0 bg-black/5" />
        </div>

        <div className="relative flex flex-col px-6 pt-0 pb-6 sm:px-8 sm:pb-8">
          <div className="relative -mt-10 mb-3 w-fit">
            <Avatar className="size-20 border-4 border-popover bg-secondary shadow-md">
              <AvatarFallback tone="secondary" size="lg" weight="bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            {online != null ? (
              <span
                className={cn(
                  "absolute right-1 bottom-1 size-3.5 rounded-full border-2 border-popover",
                  online ? "bg-brand" : "bg-muted-foreground/40"
                )}
              />
            ) : null}
          </div>

          <div className="flex flex-col gap-0.5">
            <h3 className="font-heading text-xl leading-tight font-bold text-foreground">
              {name}
            </h3>
            <p className="text-xs text-muted-foreground">
              @{initials?.toLowerCase()}
            </p>
          </div>

          {blurb ? (
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {blurb}
            </p>
          ) : null}

          {sport && level ? (
            <div className="mt-5 flex flex-col gap-3">
              <h4 className="font-mono text-micro font-bold tracking-wider text-muted-foreground uppercase">
                {m.profile_player_level()}
              </h4>
              <div className="flex items-center gap-3 rounded-2xl border border-chart-3/20 bg-chart-3/5 p-3.5">
                <SportDot sport={sport} />
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-foreground">
                    {sportsMessages[sport]()}
                  </span>
                  <LevelChip level={level} />
                </div>
                {matchPct != null ? (
                  <div className="ml-auto flex flex-col items-end">
                    <span className="font-mono text-sm font-bold text-brand tabular-nums">
                      {matchPct}%
                    </span>
                    <span className="text-micro text-muted-foreground">
                      {m.profile_match_score()}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {distanceKm != null ? (
            <div className="mt-3 flex w-fit items-center justify-center rounded-2xl bg-muted/40 px-3 py-2 ring-1 ring-foreground/5 dark:ring-foreground/10">
              <span className="font-mono text-mini text-muted-foreground tabular-nums">
                {m.profile_km_away({ km: distanceKm })}
              </span>
            </div>
          ) : null}

          {member?.userId && !fullPlayer ? (
            <PlayerSkillLevels userId={member.userId} open={open} />
          ) : null}

          {member?.userId ? (
            <PlayerReviews userId={member.userId} open={open} />
          ) : null}
        </div>
      </div>
    </Dialog>
  )
}

/**
 * A real player's assessed level per sport
 * (`/api/elo/users/:id/level`) — loaded when the profile opens, so a
 * browsing player can judge the line-up before asking to join a room.
 */
function PlayerSkillLevels({
  userId,
  open,
}: {
  userId: string
  open: boolean
}) {
  const {
    data: levels = [],
    isPending: loading,
    isError,
  } = useQuery({
    ...eloQueries.playerLevel(userId),
    enabled: open && Boolean(userId),
  })

  return (
    <div className="mt-5 flex flex-col gap-3">
      <h4 className="font-mono text-micro font-bold tracking-wider text-muted-foreground uppercase">
        {m.profile_player_level()}
      </h4>
      {loading ? (
        <div className="h-16 animate-pulse rounded-2xl bg-muted/50" />
      ) : levels.length ? (
        levels.map((l) => (
          <div
            key={l.sport}
            className="flex items-center gap-3 rounded-2xl border border-chart-3/20 bg-chart-3/5 p-3.5"
          >
            <SportDot sport={l.sport} />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-foreground">
                {sportsMessages[l.sport]()}
              </span>
              <LevelChip level={l.level} />
            </div>
            <span className="ml-auto font-mono text-sm font-bold text-brand tabular-nums">
              {m.profile_elo({ elo: l.elo })}
            </span>
          </div>
        ))
      ) : (
        <p className="rounded-2xl border border-dashed border-border px-4 py-4 text-center text-xs text-muted-foreground">
          {isError ? m.profile_level_unavailable() : m.profile_not_assessed()}
        </p>
      )}
    </div>
  )
}

/**
 * A real player's peer reviews (`/api/ratings/users/:id/summary`) — average,
 * count and newest reviews left after played matches. Reviews are anonymous:
 * the api sends no rater, so each one is labelled as such. Loaded when the profile
 * opens; shows an empty state until the player has been rated.
 */
function PlayerReviews({ userId, open }: { userId: string; open: boolean }) {
  const {
    data: summary = null,
    isPending: loading,
    isError,
  } = useQuery({
    ...profileQueries.playerReviews(userId),
    enabled: open && Boolean(userId),
  })
  const average = summary?.average ?? 0
  const ago = (iso: string) => relativeTime(new Date(iso))

  return (
    <div className="mt-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h4 className="font-mono text-micro font-bold tracking-wider text-muted-foreground uppercase">
          {m.profile_reviews_label()}
        </h4>
        {summary?.count ? (
          <div className="flex items-center gap-1.5">
            <Stars value={average} className="size-3" />
            <span className="font-mono text-mini font-bold text-foreground tabular-nums">
              {average.toFixed(1)}
            </span>
            <span className="text-micro text-muted-foreground">
              · {m.profile_ratings_count({ count: summary.count })}
            </span>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2.5">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-2xl bg-muted/50"
            />
          ))}
        </div>
      ) : !summary?.count ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          {isError ? m.profile_reviews_unavailable() : m.profile_no_reviews()}
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {summary.recent.map((review, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-2xl bg-muted/40 p-3.5 ring-1 ring-foreground/5 dark:ring-foreground/10"
            >
              <div className="flex items-center gap-2.5">
                <Avatar className="size-7 shrink-0">
                  <AvatarFallback tone="secondary" size="micro" weight="bold">
                    <EyeOff className="size-3.5" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {m.profile_review_anonymous()}
                  </p>
                  <Stars value={review.stars} className="mt-0.5 size-2.5" />
                </div>
                <span className="shrink-0 font-mono text-micro text-muted-foreground">
                  {ago(review.createdAt)}
                </span>
              </div>
              {review.comment ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {review.comment}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Five stars, filled up to the rounded `value`. */
function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            className,
            i < Math.round(value)
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/25"
          )}
        />
      ))}
    </div>
  )
}
