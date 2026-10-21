import { z } from "zod"
import { Focusable } from "react-aria-components"
import { formatVndText } from "@/lib/money"
import * as React from "react"
import { getLocale } from "@/paraglide/runtime"
import { toast } from "sonner"
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarRange,
  Flame,
  Footprints,
  Grid3x3,
  MoreHorizontal,
  Send,
  Smartphone,
  Snowflake,
  Tag,
  TrendingUp,
  UserPlus,
  Wrench,
} from "lucide-react"

import { useAppForm } from "@/components/form"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { Button, LinkButton } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Popover, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip"
import { useData } from "@/features/dashboard/components/data-provider"
import { venueBase } from "@/features/venue/nav"
import {
  useAddCourtBlock,
  useVenueData,
} from "@/features/venue/api/venue.queries"
import {
  COLD_SLOT_THRESHOLD,
  COURT_BLOCK_REASONS,
  HEATMAP_DAYS,
  HEATMAP_HOURS,
  computeColdSlots,
  computeHourCoverage,
  computeWeekdayHeatmap,
  formatVndFull,
  locStr,
  weekdayCoverageFromHeatmap,
  nextDateForWeekday,
} from "@/lib/shared"
import type {
  BookingSource,
  ColdSlot,
  CourtBlockReason,
  VenueCourt,
} from "@/lib/shared"
import {
  Meter,
  MicroLabel,
  VenueEmpty,
  VenuePanel,
  VenueStat,
} from "@/features/venue/components/shared"
import { m } from "@/paraglide/messages"

const channelsSourceMessages = {
  app: m.venue_analytics_channels_source_app,
  "walk-in": m.venue_analytics_channels_source_walk_in,
} as const

const coldSlotsReasonMessages = {
  veryLow: m.venue_analytics_cold_slots_reason_very_low,
  low: m.venue_analytics_cold_slots_reason_low,
} as const

const blockReasonsMessages = {
  maintenance: m.venue_schedule_block_reasons_maintenance,
  internal: m.venue_schedule_block_reasons_internal,
  vip: m.venue_schedule_block_reasons_vip,
  break: m.venue_schedule_block_reasons_break,
} as const

const CHANNEL_ICON: Record<
  BookingSource,
  React.ComponentType<{ className?: string }>
> = {
  app: Smartphone,
  "walk-in": Footprints,
}

export function VenueAnalyticsView({
  embedded = false,
}: {
  embedded?: boolean
} = {}) {
  const locale = getLocale()
  const { todayIso } = useData()
  const {
    venueId,
    channelMix: CHANNEL_MIX,
    reservations: RESERVATIONS,
    revenueSeries: REVENUE_SERIES,
    venueCourts: VENUE_COURTS,
    venueStats: VENUE_STATS,
  } = useVenueData()

  // ── Revenue rollup (deterministic — no Date/random) ──
  const weeklyTotal = REVENUE_SERIES.reduce((sum, d) => sum + d.value, 0)
  const revValues = REVENUE_SERIES.map((d) => d.value)
  const revLabels = REVENUE_SERIES.map((d) => locStr(d.label, locale))
  const lastIdx = REVENUE_SERIES.length - 1
  // Peak day, guarded for an empty/zero series (Math.max([]) === -Infinity).
  const peakRevenue = revValues.length ? Math.max(...revValues) : 0
  const peakDayLabel = revValues.length
    ? (revLabels[revValues.indexOf(peakRevenue)] ?? "")
    : ""

  // Real weekday × hour occupancy — averaged across every date on record for
  // that weekday, so a recurring quiet slot reads as quiet even with only a
  // few weeks of history. Zeroed cells for a bare venue are an honest "no
  // bookings yet" rather than a fabricated pattern.
  const weekdayHeatmap = React.useMemo(
    () => computeWeekdayHeatmap(VENUE_COURTS, RESERVATIONS),
    [VENUE_COURTS, RESERVATIONS]
  )
  const hourCoverage = React.useMemo(
    () => computeHourCoverage(VENUE_COURTS, RESERVATIONS),
    [VENUE_COURTS, RESERVATIONS]
  )
  const weekdayCoverage = React.useMemo(
    () => weekdayCoverageFromHeatmap(weekdayHeatmap),
    [weekdayHeatmap]
  )
  // Cold slots only mean something once there's real occupancy to compare
  // against — an all-zero grid (a venue with no bookings on record, or none in
  // the visible hour window) has no "quiet" cells to surface, just no data.
  const hasActivity = React.useMemo(
    () => weekdayHeatmap.some((row) => row.some((v) => v > 0)),
    [weekdayHeatmap]
  )
  const coldSlots = React.useMemo(
    () => (hasActivity ? computeColdSlots(weekdayHeatmap, HEATMAP_HOURS) : []),
    [hasActivity, weekdayHeatmap]
  )
  const [coverageView, setCoverageView] = React.useState<"hour" | "weekday">(
    "hour"
  )

  return (
    <div className="flex flex-col gap-5">
      {!embedded ? (
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {m.venue_analytics_title()}
          </h1>
          <p className="text-sm text-muted-foreground">
            {m.venue_analytics_subtitle()}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <VenueStat
          label={m.venue_analytics_kpi_revenue()}
          value={formatVndText(weeklyTotal)}
          delta={VENUE_STATS.revenueDelta}
          deltaSuffix="%"
          icon={TrendingUp}
        />
        <VenueStat
          label={m.venue_analytics_kpi_utilization()}
          value={`${VENUE_STATS.utilization}`}
          unit="%"
          delta={VENUE_STATS.occupancyDelta}
          deltaSuffix="%"
          icon={BarChart3}
        />
        <VenueStat
          label={m.venue_analytics_kpi_no_show()}
          value={`${VENUE_STATS.noShowRate}`}
          unit="%"
          delta={VENUE_STATS.noShowDelta}
          deltaSuffix="%"
          icon={Flame}
          invert
        />
        <VenueStat
          label={m.venue_analytics_kpi_new_customers()}
          value={`${VENUE_STATS.newCustomers}`}
          delta={VENUE_STATS.newCustomersDelta}
          icon={UserPlus}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <VenuePanel
          title={m.venue_analytics_revenue_title()}
          icon={TrendingUp}
          className="lg:col-span-3"
          action={
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums",
                VENUE_STATS.revenueDelta >= 0
                  ? "text-brand"
                  : "text-destructive"
              )}
            >
              {VENUE_STATS.revenueDelta >= 0 ? (
                <ArrowUpRight className="size-3.5" />
              ) : (
                <ArrowDownRight className="size-3.5" />
              )}
              {VENUE_STATS.revenueDelta >= 0 ? "+" : ""}
              {VENUE_STATS.revenueDelta}%
            </span>
          }
        >
          <div className="flex flex-col gap-1">
            <MicroLabel>{m.venue_analytics_revenue_weekly_total()}</MicroLabel>
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-3xl font-bold tracking-tight tabular-nums">
                {formatVndFull(weeklyTotal)}
              </span>
            </div>
          </div>
          <RevenueBars
            values={revValues}
            labels={revLabels}
            highlight={lastIdx}
          />
          <div className="flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-gradient-to-t from-brand to-lime" />
              {m.venue_analytics_revenue_today()}
            </span>
            <span className="font-mono tabular-nums">
              {m.venue_analytics_revenue_peak_day({
                day: peakDayLabel,
                amount: formatVndText(peakRevenue),
              })}
            </span>
          </div>
        </VenuePanel>

        <VenuePanel
          title={m.venue_analytics_coverage_title()}
          icon={BarChart3}
          className="lg:col-span-2"
          action={
            <Tabs
              selectedKey={coverageView}
              onSelectionChange={(v) =>
                setCoverageView(v as "hour" | "weekday")
              }
            >
              <TabsList className="h-7">
                <TabsTrigger id="hour" className="px-2 text-mini">
                  {m.venue_analytics_coverage_toggle_hour()}
                </TabsTrigger>
                <TabsTrigger id="weekday" className="px-2 text-mini">
                  {m.venue_analytics_coverage_toggle_weekday()}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          }
        >
          <MicroLabel>{m.venue_analytics_coverage_caption()}</MicroLabel>
          <CoverageBars
            values={
              coverageView === "hour"
                ? hourCoverage.map((p) => p.util)
                : weekdayCoverage.map((p) => p.util)
            }
            labels={
              coverageView === "hour"
                ? hourCoverage.map((p) => p.hour.slice(0, 2))
                : HEATMAP_DAYS.map((d) => locStr(d, locale))
            }
          />
          <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground">
            {m.venue_analytics_coverage_note()}
          </p>
        </VenuePanel>
      </div>

      <VenuePanel
        title={m.venue_analytics_heatmap_title()}
        icon={Grid3x3}
        action={<MicroLabel>{m.venue_analytics_heatmap_caption()}</MicroLabel>}
      >
        <p className="-mt-1 text-xs text-muted-foreground">
          {m.venue_analytics_heatmap_explain()}
        </p>
        <div className="overflow-x-auto">
          <div className="min-w-136">
            <div className="mb-1 grid grid-cols-schedule gap-1">
              <span />
              {HEATMAP_HOURS.map((h) => (
                <span
                  key={h}
                  className="text-center font-mono text-micro tracking-wider text-muted-foreground tabular-nums"
                >
                  {h}
                </span>
              ))}
            </div>
            {/* Rows: one per weekday, Mon → Sun */}
            <div className="flex flex-col gap-1">
              {weekdayHeatmap.map((row, d) => (
                <div
                  key={d}
                  className="grid grid-cols-schedule items-center gap-1"
                >
                  <span className="font-mono text-micro tracking-wider text-muted-foreground uppercase">
                    {locStr(HEATMAP_DAYS[d], locale)}
                  </span>
                  {row.map((v, h) => (
                    <HeatCell
                      key={h}
                      value={v}
                      cold={coldSlots.some(
                        (s) => s.weekdayIdx === d && s.hour === HEATMAP_HOURS[h]
                      )}
                      label={`${locStr(HEATMAP_DAYS[d], locale)} · ${HEATMAP_HOURS[h]}:00 · ${v}%`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <span>{m.venue_analytics_heatmap_low()}</span>
            <span className="flex gap-0.5">
              {[0.12, 0.3, 0.5, 0.7, 0.9].map((o, i) => (
                <span
                  key={i}
                  className="size-3 rounded-hair bg-brand"
                  style={{ opacity: o }}
                />
              ))}
            </span>
            <span>{m.venue_analytics_heatmap_high()}</span>
            <span className="ml-2 inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full ring-2 ring-amber-500/60" />
              {m.venue_analytics_heatmap_cold_marker()}
            </span>
          </span>
          <span className="font-mono text-mini tracking-wider text-muted-foreground uppercase tabular-nums">
            {m.venue_analytics_heatmap_unit()}
          </span>
        </div>
      </VenuePanel>

      <ColdSlotsPanel
        coldSlots={coldSlots}
        hasActivity={hasActivity}
        locale={locale}
        todayIso={todayIso}
        venueId={venueId}
        courts={VENUE_COURTS}
      />

      <VenuePanel title={m.venue_analytics_channels_title()} icon={Smartphone}>
        <div className="flex flex-col gap-4">
          {CHANNEL_MIX.map((c) => {
            const Icon = CHANNEL_ICON[c.source]
            return (
              <div key={c.source} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-full bg-muted text-muted-foreground">
                      <Icon className="size-3.5" />
                    </span>
                    <span className="font-medium">
                      {channelsSourceMessages[c.source]()}
                    </span>
                  </span>
                  <span className="font-heading text-lg font-bold tabular-nums">
                    {c.pct}
                    <span className="text-xs font-medium text-muted-foreground">
                      %
                    </span>
                  </span>
                </div>
                <Meter pct={c.pct} />
              </div>
            )
          })}
        </div>
        <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground">
          {m.venue_analytics_channels_note({ pct: CHANNEL_MIX[0]?.pct ?? 0 })}
        </p>
      </VenuePanel>
    </div>
  )
}

/**
 * Vertical revenue bars with VND value tooltips on top. Mirrors MiniBars but
 * shows the formatted amount above each bar and accents today.
 */
function RevenueBars({
  values,
  labels,
  highlight,
}: {
  values: number[]
  labels: string[]
  highlight: number
}) {
  const max = Math.max(...values, 1)
  return (
    <div className="flex items-end gap-2">
      {values.map((v, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
          <span
            className={cn(
              "font-mono text-micro tabular-nums",
              i === highlight
                ? "font-semibold text-brand"
                : "text-muted-foreground"
            )}
          >
            {formatVndText(v)}
          </span>
          <div className="flex h-28 w-full items-end">
            <div
              className={cn(
                "w-full rounded-lg transition-all",
                i === highlight
                  ? "bg-gradient-to-t from-brand to-lime"
                  : "bg-brand/20"
              )}
              style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
            />
          </div>
          <span className="font-mono text-micro text-muted-foreground tabular-nums">
            {labels[i]}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Vertical percentage bars — a quiet (≤ threshold) column reads amber, not brand. */
function CoverageBars({
  values,
  labels,
}: {
  values: number[]
  labels: string[]
}) {
  return (
    <div className="flex items-end gap-1">
      {values.map((v, i) => {
        const cold = v <= COLD_SLOT_THRESHOLD
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
            <span
              className={cn(
                "font-mono text-micro tabular-nums",
                cold ? "font-semibold text-amber-600" : "text-muted-foreground"
              )}
            >
              {v}%
            </span>
            <div className="flex h-24 w-full items-end">
              <div
                className={cn(
                  "w-full rounded-lg transition-all",
                  cold
                    ? "bg-amber-500/25"
                    : "bg-gradient-to-t from-brand to-lime"
                )}
                style={{ height: `${Math.max(4, v)}%` }}
              />
            </div>
            <span className="font-mono text-micro text-muted-foreground tabular-nums">
              {labels[i]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** A single heatmap cell — brand at an opacity scaled to the utilization. */
function HeatCell({
  value,
  cold,
  label,
}: {
  value: number
  cold?: boolean
  label: string
}) {
  // Map 0–100 → 0.06–0.95 so even quiet cells read as a faint tile.
  const opacity = 0.06 + (Math.max(0, Math.min(100, value)) / 100) * 0.89
  const hot = value >= 80
  const cell = (
    <div
      tabIndex={0}
      className={cn(
        "group/cell relative aspect-square w-full rounded-tight bg-muted/40 ring-1 ring-foreground/5 transition-transform ring-inset hover:scale-110 hover:ring-foreground/15",
        hot && "ring-lime/30",
        cold && "ring-2 ring-amber-500/50"
      )}
    >
      <div
        className="absolute inset-0 rounded-tight bg-brand"
        style={{ opacity }}
      />
      {cold ? (
        <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-amber-500" />
      ) : null}
      <span className="absolute inset-0 grid place-items-center font-mono text-nano font-semibold text-brand-foreground tabular-nums opacity-0 transition-opacity group-hover/cell:opacity-100">
        {value}
      </span>
    </div>
  )
  return (
    <TooltipTrigger delay={0}>
      <Focusable>{cell}</Focusable>
      <Tooltip>{label}</Tooltip>
    </TooltipTrigger>
  )
}

/** The operator's action list for the quietest weekday × hour cells. */
function ColdSlotsPanel({
  coldSlots,
  hasActivity,
  locale,
  todayIso,
  venueId,
  courts,
}: {
  coldSlots: ColdSlot[]
  hasActivity: boolean
  locale: string
  todayIso: string
  venueId: string
  courts: VenueCourt[]
}) {
  const [blockTarget, setBlockTarget] = React.useState<ColdSlot | null>(null)

  return (
    <VenuePanel
      title={m.venue_analytics_cold_slots_title()}
      icon={Snowflake}
      action={<MicroLabel>{m.venue_analytics_cold_slots_caption()}</MicroLabel>}
    >
      <p className="-mt-1 text-xs text-muted-foreground">
        {m.venue_analytics_cold_slots_subtitle()}
      </p>
      {coldSlots.length ? (
        <div className="flex flex-col divide-y divide-border/60">
          {coldSlots.map((slot) => (
            <ColdSlotRow
              key={`${slot.weekdayIdx}-${slot.hour}`}
              slot={slot}
              locale={locale}
              todayIso={todayIso}
              venueId={venueId}
              onRequestBlock={() => setBlockTarget(slot)}
            />
          ))}
        </div>
      ) : (
        <VenueEmpty
          text={
            hasActivity
              ? m.venue_analytics_cold_slots_all_healthy()
              : m.venue_analytics_cold_slots_empty()
          }
        />
      )}
      <ColdSlotBlockDialog
        target={blockTarget}
        locale={locale}
        todayIso={todayIso}
        venueId={venueId}
        courts={courts}
        onClose={() => setBlockTarget(null)}
      />
    </VenuePanel>
  )
}

function ColdSlotRow({
  slot,
  locale,
  todayIso,
  venueId,
  onRequestBlock,
}: {
  slot: ColdSlot
  locale: string
  todayIso: string
  venueId: string
  onRequestBlock: () => void
}) {
  const dayLabel = locStr(HEATMAP_DAYS[slot.weekdayIdx], locale)
  const endHour = String(Number(slot.hour) + 2).padStart(2, "0")
  const slotLabel = `${dayLabel} · ${slot.hour}:00–${endHour}:00`
  const reasonKey = slot.util <= 10 ? "veryLow" : "low"
  const resolvedDate = nextDateForWeekday(slot.weekdayIdx, todayIso)
  const suggestedPct = slot.util <= 10 ? 25 : slot.util <= 20 ? 20 : 15

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium tabular-nums">{slotLabel}</span>
          <span className="font-mono text-mini font-semibold text-amber-600 tabular-nums">
            {slot.util}%
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {coldSlotsReasonMessages[reasonKey]({ pct: slot.util })}
        </p>
      </div>
      <PopoverTrigger>
        <Button
          variant="ghost"
          className={cn(
            "h-auto justify-start font-normal whitespace-normal",
            "grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          )}
        >
          <MoreHorizontal className="size-4" />
        </Button>
        <Popover placement="bottom end" className="w-64 p-3">
          <div className="flex flex-col gap-3">
            <div>
              <MicroLabel>
                {m.venue_analytics_cold_slots_actions_title()}
              </MicroLabel>
              <p className="mt-0.5 text-sm font-semibold">{slotLabel}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Button
                shape="pill"
                size="sm"
                className="w-full justify-start"
                onPress={onRequestBlock}
              >
                <Wrench />
                {m.venue_analytics_cold_slots_actions_block()}
              </Button>
              <LinkButton
                shape="pill"
                size="sm"
                variant="outline"
                className="w-full justify-start"
                href={`${venueBase(venueId)}/schedule?day=${resolvedDate}`}
              >
                <CalendarRange />
                {m.venue_analytics_cold_slots_actions_open_schedule()}
              </LinkButton>
              <Button
                shape="pill"
                size="sm"
                variant="ghost"
                className="w-full justify-start text-muted-foreground"
                onPress={() =>
                  toast(m.venue_analytics_cold_slots_toast_promo_title(), {
                    description: m.venue_analytics_cold_slots_toast_promo_desc({
                      slot: slotLabel,
                      pct: suggestedPct,
                    }),
                  })
                }
              >
                <Tag />
                {m.venue_analytics_cold_slots_actions_promo()}
              </Button>
              <Button
                shape="pill"
                size="sm"
                variant="ghost"
                className="w-full justify-start text-muted-foreground"
                onPress={() =>
                  toast(m.venue_analytics_cold_slots_toast_invite_title(), {
                    description: m.venue_analytics_cold_slots_toast_invite_desc(
                      {
                        slot: slotLabel,
                      }
                    ),
                  })
                }
              >
                <Send />
                {m.venue_analytics_cold_slots_actions_invite()}
              </Button>
            </div>
          </div>
        </Popover>
      </PopoverTrigger>
    </div>
  )
}

/**
 * Close off a cold slot with a required reason — a venue-level counterpart to
 * `schedule.tsx`'s per-court `BlockDialog`, with a court picker since a cold
 * slot is a venue-wide aggregate rather than one court's grid cell. Always the
 * next real calendar date matching the slot's weekday, and the heatmap's
 * 2-hour column width as the block's duration.
 */
function ColdSlotBlockDialog({
  target,
  locale,
  todayIso,
  venueId,
  courts,
  onClose,
}: {
  target: ColdSlot | null
  locale: string
  todayIso: string
  venueId: string
  courts: VenueCourt[]
  onClose: () => void
}) {
  const addBlock = useAddCourtBlock(venueId)
  const durationMin = 120
  const resolvedDate = target
    ? nextDateForWeekday(target.weekdayIdx, todayIso)
    : ""
  const start = target ? `${target.hour}:00` : ""
  const dayLabel = target ? locStr(HEATMAP_DAYS[target.weekdayIdx], locale) : ""
  const slotLabel = target ? `${dayLabel} · ${start} · ${resolvedDate}` : ""

  return (
    <Dialog
      isOpen={target !== null}
      onOpenChange={(open) => !open && onClose()}
      className="sm:max-w-md"
    >
      <DialogHeader>
        <DialogTitle>{m.venue_analytics_cold_slots_dialog_title()}</DialogTitle>
        <DialogDescription>{slotLabel}</DialogDescription>
      </DialogHeader>
      {target ? (
        <ColdSlotBlockForm
          key={`${target.weekdayIdx}-${target.hour}`}
          courts={courts}
          onCancel={onClose}
          onSubmit={async (value) => {
            try {
              await addBlock.mutateAsync({
                courtId: value.courtId,
                dateKey: resolvedDate,
                start,
                durationMin,
                reason: value.reason,
                note: value.note.trim() || undefined,
              })
              toast.success(m.venue_schedule_toast_block_title(), {
                description: slotLabel,
              })
              onClose()
            } catch (error) {
              toast.error(
                error instanceof Error ? error.message : "Failed to block slot"
              )
            }
          }}
        />
      ) : null}
    </Dialog>
  )
}

const coldSlotBlockSchema = z.object({
  courtId: z.string().min(1),
  reason: z.custom<CourtBlockReason>(),
  note: z.string(),
})

function ColdSlotBlockForm({
  courts,
  onCancel,
  onSubmit,
}: {
  courts: VenueCourt[]
  onCancel: () => void
  onSubmit: (value: z.infer<typeof coldSlotBlockSchema>) => Promise<void>
}) {
  const bookableCourts = courts.filter((c) => !c.archived)
  const form = useAppForm({
    defaultValues: {
      courtId: bookableCourts.at(0)?.id ?? "",
      reason: "internal" as CourtBlockReason,
      note: "",
    },
    validators: { onChange: coldSlotBlockSchema },
    onSubmit: ({ value }) => onSubmit(value),
  })

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="courtId">
        {(field) => (
          <Select
            className="flex flex-col gap-1.5 text-sm font-medium"
            value={field.state.value || null}
            onChange={(v) => {
              if (typeof v === "string") field.handleChange(v)
            }}
          >
            <Label>{m.venue_analytics_cold_slots_dialog_court()}</Label>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {bookableCourts.map((c) => (
                <SelectItem key={c.id} id={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </form.Field>
      <form.Field name="reason">
        {(field) => (
          <Select
            className="flex flex-col gap-1.5 text-sm font-medium"
            value={field.state.value}
            onChange={(v) => {
              const next = COURT_BLOCK_REASONS.find((r) => r === v)
              if (next) field.handleChange(next)
            }}
          >
            <Label>{m.venue_schedule_block_dialog_reason_label()}</Label>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COURT_BLOCK_REASONS.map((r) => (
                <SelectItem key={r} id={r}>
                  {blockReasonsMessages[r]()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </form.Field>
      <form.AppField name="note">
        {(field) => (
          <field.TextField
            label={m.venue_schedule_block_dialog_note_label()}
            placeholder={m.venue_schedule_block_dialog_note_placeholder()}
          />
        )}
      </form.AppField>
      <DialogFooter>
        <Button type="button" variant="outline" onPress={onCancel}>
          {m.venue_analytics_cold_slots_dialog_cancel()}
        </Button>
        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting] as const}
        >
          {([canSubmit, isSubmitting]) => (
            <Button type="submit" isDisabled={!canSubmit || isSubmitting}>
              {m.venue_analytics_cold_slots_dialog_submit()}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  )
}
