import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { Minus, TrendingDown, TrendingUp } from "lucide-react"

import { Button } from "@/components/ui/button"
import { eloQueries } from "@/features/elo/api/elo.queries"
import type { EloHistoryEntry } from "@/features/elo/api/elo.queries"
import { relativeTime } from "@/lib/relative-time"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

/** Rows shown before "show all". */
const COLLAPSED_ROWS = 4

/** "+12" / "−8" / "0" — a real minus sign, so it lines up with the plus. */
function signed(delta: number): string {
  if (delta > 0) return `+${delta}`
  if (delta < 0) return `−${Math.abs(delta)}`
  return "0"
}

/**
 * The signed-in player's Elo history: a trend line over every adjustment and
 * the adjustments themselves, newest first. Changes come from anonymous peer
 * ratings, so a row says what changed and when — never which match or who.
 * Loaded when the profile opens.
 */
export function EloHistory({ open }: { open: boolean }) {
  const {
    data,
    isPending: loading,
    isError,
  } = useQuery({ ...eloQueries.history(), enabled: open })
  const [expanded, setExpanded] = React.useState(false)

  const changes = data?.changes ?? []
  const rows = expanded ? changes : changes.slice(0, COLLAPSED_ROWS)
  const total =
    data?.currentElo != null && data.initialElo != null
      ? data.currentElo - data.initialElo
      : 0

  return (
    <div className="mt-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-mono text-micro font-bold tracking-wider text-muted-foreground uppercase">
          {m.profile_elo_history_label()}
        </h4>
        {changes.length ? (
          <span className="text-micro text-muted-foreground tabular-nums">
            {m.profile_elo_history_total({ delta: signed(total) })}
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="h-28 animate-pulse rounded-2xl bg-muted/50" />
      ) : !changes.length ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          {isError
            ? m.profile_elo_history_unavailable()
            : m.profile_elo_history_empty()}
        </p>
      ) : (
        <>
          <EloTrend changes={changes} />
          <ul className="flex flex-col gap-2">
            {rows.map((change, i) => (
              <ChangeRow key={`${change.createdAt}-${i}`} change={change} />
            ))}
          </ul>
          {changes.length > COLLAPSED_ROWS ? (
            <Button
              shape="pill"
              variant="ghost"
              size="sm"
              className="self-center"
              onPress={() => setExpanded((v) => !v)}
            >
              {expanded
                ? m.profile_elo_history_show_less()
                : m.profile_elo_history_show_all({ count: changes.length })}
            </Button>
          ) : null}
        </>
      )}
    </div>
  )
}

function ChangeRow({ change }: { change: EloHistoryEntry }) {
  const Icon =
    change.delta > 0 ? TrendingUp : change.delta < 0 ? TrendingDown : Minus
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-muted/40 px-3.5 py-2.5 ring-1 ring-foreground/5 dark:ring-foreground/10">
      {/* Direction is carried by the icon and the sign, not by colour alone. */}
      <Icon
        aria-hidden="true"
        className={cn(
          "size-4 shrink-0",
          change.delta > 0
            ? "text-brand"
            : change.delta < 0
              ? "text-destructive"
              : "text-muted-foreground"
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-foreground">
          {m.profile_elo_history_reason_peer()}
        </p>
        <p className="text-micro text-muted-foreground">
          {relativeTime(new Date(change.createdAt))}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className="font-mono text-sm font-bold text-foreground tabular-nums">
          {signed(change.delta)}
        </span>
        <span className="font-mono text-micro text-muted-foreground tabular-nums">
          {change.eloBefore} → {change.eloAfter}
        </span>
      </div>
    </li>
  )
}

// ── Trend line ───────────────────────────────────────────────────────────

const W = 320
const H = 112
const PAD = { top: 12, right: 14, bottom: 12, left: 38 }
/** Smallest Elo span the y-axis shows, so a ±5 history isn't drawn as a cliff. */
const MIN_SPAN = 60

interface TrendPoint {
  elo: number
  /** Null for the starting point (the Elo before the oldest change shown). */
  change: EloHistoryEntry | null
}

/**
 * One series (Elo after each adjustment, oldest → newest), so no legend: the
 * section title names it. Points are evenly spaced per adjustment, not by
 * date. Hovering a point shows its value in the readout above; the list under
 * the chart is the same data as text, for keyboard and screen-reader users.
 */
function EloTrend({ changes }: { changes: EloHistoryEntry[] }) {
  const points = React.useMemo<TrendPoint[]>(() => {
    const oldestFirst = [...changes].reverse()
    return [
      { elo: oldestFirst[0].eloBefore, change: null },
      ...oldestFirst.map((change) => ({ elo: change.eloAfter, change })),
    ]
  }, [changes])
  const [active, setActive] = React.useState<number | null>(null)

  const values = points.map((p) => p.elo)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = Math.max(8, (MIN_SPAN - (hi - lo)) / 2)
  const yMin = lo - pad
  const yMax = hi + pad
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const step = plotW / (points.length - 1)
  const x = (i: number) => PAD.left + i * step
  const y = (elo: number) =>
    PAD.top + plotH - ((elo - yMin) / (yMax - yMin)) * plotH
  const path = points
    .map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.elo).toFixed(1)}`)
    .join(" ")

  const last = points.length - 1
  const shown = points[active ?? last]

  return (
    <figure className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-3">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="font-heading text-lg leading-none font-bold text-foreground tabular-nums">
          {shown.elo}
        </span>
        <span className="truncate text-micro text-muted-foreground tabular-nums">
          {shown.change
            ? `${signed(shown.change.delta)} · ${relativeTime(new Date(shown.change.createdAt))}`
            : m.profile_elo_history_start()}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={m.profile_elo_history_chart_label({
          count: changes.length,
          from: points[0].elo,
          to: points[last].elo,
        })}
        className="h-auto w-full overflow-visible"
        onMouseLeave={() => setActive(null)}
      >
        {/* Recessive frame: only the highest and lowest values are labelled. */}
        {(hi === lo ? [hi] : [hi, lo]).map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(value)}
              y2={y(value)}
              className="stroke-border"
              strokeWidth={1}
              strokeDasharray="2 4"
            />
            <text
              x={PAD.left - 8}
              y={y(value)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground font-mono text-micro tabular-nums"
            >
              {value}
            </text>
          </g>
        ))}
        {active !== null ? (
          <line
            x1={x(active)}
            x2={x(active)}
            y1={PAD.top}
            y2={H - PAD.bottom}
            className="stroke-foreground/25"
            strokeWidth={1}
          />
        ) : null}
        <path
          d={path}
          fill="none"
          className="stroke-brand"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, i) => {
          // Markers only where they help: few points, the ends, or the active one.
          const marked =
            points.length <= 12 || i === last || i === 0 || i === active
          return (
            <g key={i}>
              {marked ? (
                <circle
                  cx={x(i)}
                  cy={y(p.elo)}
                  r={i === active || i === last ? 4.5 : 3.5}
                  className="fill-brand stroke-card"
                  strokeWidth={2}
                />
              ) : null}
              {/* Hit target: the whole column, far bigger than the marker. */}
              <rect
                x={x(i) - step / 2}
                y={0}
                width={step}
                height={H}
                fill="transparent"
                onMouseEnter={() => setActive(i)}
                // Touch: a tap selects the point (no hover on phones).
                onClick={() => setActive(i)}
              />
            </g>
          )
        })}
      </svg>
    </figure>
  )
}
