import { useLocation, useRouter } from "@tanstack/react-router"
import * as React from "react"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { EyeOff, RotateCcw, Star } from "lucide-react"
import { initialsOf } from "@/lib/shared"
import { relativeTime } from "@/lib/relative-time"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuthUser } from "@/features/dashboard/hooks/use-auth-user"
import { useData } from "@/features/dashboard/components/data-provider"
import { eloQueries } from "@/features/elo/api/elo.queries"
import { EloHistory } from "@/features/elo/components/elo-history"
import { profileQueries } from "@/features/dashboard/api/profile.queries"
import { usePlayerIdentity } from "@/features/play/hooks/use-player-identity"
import { LevelChip, SportDot } from "@/features/dashboard/components/shared"
import { ELO_ASSESSMENT_PATH } from "@/features/elo/lib/elo"
import { presenceText, usePresence } from "@/features/presence/presence"
import { ReliabilityBadge } from "@/features/play/components/reliability-badge"
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
      className="no-scrollbar block max-h-sheet-90 max-w-page-width gap-0 overflow-y-auto p-0 sm:max-w-md"
    >
      <DialogHeader className="sr-only">
        <DialogTitle>{m.sidebar_profile()}</DialogTitle>
        <DialogDescription>{m.profile_dialog_description()}</DialogDescription>
      </DialogHeader>

      <div>
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
                  {/* Tạm tính cho đến khi đủ đánh giá chéo thu hẹp ước lượng. */}
                  {elo ? (
                    <span className="ml-auto rounded-full bg-background/70 px-2 py-0.5 text-micro font-medium text-muted-foreground ring-1 ring-foreground/10">
                      {elo.status === "ESTABLISHED"
                        ? m.profile_elo_status_established()
                        : m.profile_elo_status_provisional()}
                    </span>
                  ) : null}
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

          {elo ? <EloHistory open={open} /> : null}

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
   * member — their display name, their Clerk id for peer reviews, and their
   * picture. A caller that only knows the real account (a chat member) passes
   * `initials={null}`, so no seed player is matched by initials.
   */
  member?: { name: string; userId?: string; image?: string } | null
  /**
   * Why this player was suggested, when the caller ranked them (the AI's
   * player search): the compatibility score and its reasons.
   */
  match?: { pct: number; reason: string } | null
}

export function PlayerProfileDialog({
  initials,
  open,
  onOpenChange,
  member,
  match,
}: PlayerProfileDialogProps) {
  const { players, playerByInitials } = useData()
  const pathname = useLocation({ select: (l) => l.pathname })
  const playScope = pathname === "/app/play"

  // A real account is found by its id (initials collide between people); a
  // seed player only has its initials.
  const fullPlayer = member?.userId
    ? players.find((p) => p.id === member.userId)
    : initials
      ? players.find((p) => p.initials === initials)
      : null
  /** A real account: its level, presence and reviews come from the api. */
  const real = Boolean(member?.userId) && !fullPlayer?.demo
  const rosterEntry = initials ? playerByInitials(initials) : null

  const name =
    fullPlayer?.name || member?.name || rosterEntry?.name || initials || ""
  const level = fullPlayer?.level ?? rosterEntry?.level
  const sport = fullPlayer?.sport
  // A real player's seed record carries no score (0), so only a caller-given
  // match counts for them.
  const matchPct = match?.pct ?? (real ? undefined : fullPlayer?.matchPct)
  const distanceKm = fullPlayer?.distanceKm
  // A real account's presence is live; a seed player keeps its fixture flag.
  const presence = usePresence(member?.userId ? [member.userId] : [], open)
  const live = member?.userId ? presence.get(member.userId) : undefined
  const online = live ? live.online : fullPlayer?.online
  const presenceLabel = presenceText(live)
  const blurb = fullPlayer?.blurb
  const shownInitials = initials ?? (name ? initialsOf(name) : "")

  return (
    <Dialog
      isOpen={open}
      onOpenChange={onOpenChange}
      className={cn(
        "no-scrollbar block max-h-sheet-90 max-w-page-width gap-0 overflow-y-auto p-0 sm:max-w-md",
        playScope && "player-play-overlay"
      )}
    >
      <DialogHeader className="sr-only">
        <DialogTitle>{m.profile_view_profile()}</DialogTitle>
        <DialogDescription>
          {m.profile_player_dialog_description()}
        </DialogDescription>
      </DialogHeader>

      <div>
        <div
          className="bg-court-lines relative h-32 w-full shrink-0 bg-linear-to-br from-brand via-lime/60 to-chart-3 sm:h-36"
          aria-hidden="true"
        >
          <div className="absolute inset-0 bg-black/5" />
        </div>

        <div className="relative flex flex-col px-6 pt-0 pb-6 sm:px-8 sm:pb-8">
          <div className="relative -mt-10 mb-3 w-fit">
            <Avatar className="size-20 border-4 border-popover bg-secondary shadow-md">
              {member?.image ? (
                <AvatarImage src={member.image} alt={name} />
              ) : null}
              <AvatarFallback tone="secondary" size="lg" weight="bold">
                {shownInitials}
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
            {initials && !real ? (
              <p className="text-xs text-muted-foreground">
                @{initials.toLowerCase()}
              </p>
            ) : null}
            {presenceLabel ? (
              <p className="text-xs text-muted-foreground">{presenceLabel}</p>
            ) : null}
          </div>

          {blurb ? (
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {blurb}
            </p>
          ) : null}

          {real && member?.userId ? (
            <>
              <PlayerSkillLevels userId={member.userId} open={open} />
              <PlayerMatchFacts
                matchPct={matchPct}
                reason={match?.reason}
                trust={fullPlayer?.trust}
              />
            </>
          ) : sport && level ? (
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

          {member?.userId && !real ? (
            <PlayerSkillLevels userId={member.userId} open={open} />
          ) : null}

          {real && member?.userId && open ? (
            <ReliabilityBadge userId={member.userId} detailed />
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
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-semibold text-foreground">
                {sportsMessages[l.sport]()} · {l.label.name}
              </span>
              <LevelChip level={l.level} />
            </div>
            <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
              <span className="font-mono text-sm font-bold text-brand tabular-nums">
                {m.profile_elo({ elo: l.elo })}
              </span>
              {/* Older api responses have no status; treat as provisional. */}
              <span className="rounded-full bg-background/70 px-2 py-0.5 text-micro font-medium text-muted-foreground ring-1 ring-foreground/10">
                {l.status === "ESTABLISHED"
                  ? m.profile_elo_status_established()
                  : m.profile_elo_status_provisional()}
              </span>
            </div>
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
 * Why a real player was suggested and how reliable they are: the AI's
 * compatibility score with its reasons, and the trust score. Renders nothing
 * when neither is known.
 */
function PlayerMatchFacts({
  matchPct,
  reason,
  trust,
}: {
  matchPct?: number
  reason?: string
  trust?: number
}) {
  const hasMatch = matchPct != null && matchPct > 0
  if (!hasMatch && trust == null) return null
  return (
    <div className="mt-3 grid grid-cols-2 gap-3">
      {hasMatch ? (
        <div className="flex flex-col gap-0.5 rounded-2xl bg-muted/40 px-3.5 py-3 ring-1 ring-foreground/5 dark:ring-foreground/10">
          <span className="font-mono text-base font-bold text-brand tabular-nums">
            {matchPct}%
          </span>
          <span className="text-micro text-muted-foreground">
            {m.profile_match_score()}
          </span>
        </div>
      ) : null}
      {trust != null ? (
        <div className="flex flex-col gap-0.5 rounded-2xl bg-muted/40 px-3.5 py-3 ring-1 ring-foreground/5 dark:ring-foreground/10">
          <span className="font-mono text-base font-bold text-foreground tabular-nums">
            {trust}
          </span>
          <span className="text-micro text-muted-foreground">
            {m.profile_trust_score()}
          </span>
        </div>
      ) : null}
      {hasMatch && reason ? (
        <p className="col-span-2 text-xs leading-relaxed text-muted-foreground">
          {m.profile_match_reason({ reason })}
        </p>
      ) : null}
    </div>
  )
}

/**
 * A real player's peer reviews — the average and count
 * (`/api/ratings/users/:id/summary`) plus the reviews themselves
 * (`.../reviews`), which load a page at a time as the list is scrolled.
 * Reviews are anonymous: the api sends no rater, so each one is labelled as
 * such. Loaded when the profile opens; shows an empty state until the player
 * has been rated.
 */
function PlayerReviews({ userId, open }: { userId: string; open: boolean }) {
  const enabled = open && Boolean(userId)
  const { data: summary = null, isError: summaryFailed } = useQuery({
    ...profileQueries.playerReviews(userId),
    enabled,
  })
  const {
    data: pages,
    isPending: loading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    ...profileQueries.playerReviewPages(userId),
    enabled,
  })
  const reviews = pages?.pages.flatMap((page) => page.reviews) ?? []
  const average = summary?.average ?? 0
  const ago = (iso: string) => relativeTime(new Date(iso))

  // Lazy loading: the next page is fetched when the "load more" row scrolls
  // into view. The row is also a button, should the observer never fire.
  const moreRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const node = moreRef.current
    if (!node || !hasNextPage || isFetchingNextPage) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void fetchNextPage()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, reviews.length])

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
      ) : !reviews.length ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          {isError || summaryFailed
            ? m.profile_reviews_unavailable()
            : m.profile_no_reviews()}
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {reviews.map((review, i) => (
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
          {hasNextPage ? (
            <div ref={moreRef} className="flex justify-center">
              <Button
                shape="pill"
                variant="ghost"
                size="sm"
                isDisabled={isFetchingNextPage}
                onPress={() => void fetchNextPage()}
              >
                {isFetchingNextPage ? <Spinner /> : null}
                {m.profile_reviews_load_more()}
              </Button>
            </div>
          ) : null}
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
