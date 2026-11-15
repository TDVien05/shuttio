import { useQuery } from "@tanstack/react-query"
import { ShieldCheck, ShieldAlert } from "lucide-react"

import { cn } from "@/lib/utils"
import { reliabilityQuery } from "@/features/play/api/session.queries"
import { m } from "@/paraglide/messages"

const dateFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
})

/**
 * A player's show-up record — how often they turn up to the matches they
 * take a seat in. Hosts of self-booked rooms (no venue vouching for anyone)
 * read it before letting a stranger in. `detailed` adds the counts behind
 * the score.
 */
export function ReliabilityBadge({
  userId,
  detailed = false,
  className,
}: {
  userId: string | undefined
  detailed?: boolean
  className?: string
}) {
  const { data } = useQuery({
    ...reliabilityQuery(userId ?? ""),
    enabled: Boolean(userId),
  })
  if (!userId || !data) return null

  const score = data.score
  const tone =
    data.restrictedUntil || (score !== null && score < 70)
      ? "bg-destructive/10 text-destructive"
      : score !== null && score < 90
        ? "bg-amber-500/12 text-amber-700 dark:text-amber-400"
        : "bg-brand/10 text-brand"
  const Icon = data.restrictedUntil ? ShieldAlert : ShieldCheck

  return (
    <span className={cn("inline-flex flex-col gap-0.5", className)}>
      <span
        className={cn(
          "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-micro font-semibold",
          score === null && !data.restrictedUntil
            ? "bg-muted text-muted-foreground"
            : tone
        )}
      >
        <Icon className="size-3" />
        {m.reliability_label()}:{" "}
        {score === null ? m.reliability_new() : `${score}%`}
      </span>
      {detailed && (score !== null || data.restrictedUntil) ? (
        <span className="text-xs text-muted-foreground">
          {m.reliability_detail({
            attended: data.attended,
            noShows: data.noShows,
            lateCancels: data.lateCancels,
            days: data.windowDays,
          })}
        </span>
      ) : null}
      {detailed && data.restrictedUntil ? (
        <span className="text-xs text-destructive">
          {m.reliability_restricted({
            date: dateFmt.format(new Date(data.restrictedUntil)),
          })}
        </span>
      ) : null}
    </span>
  )
}
