import { cva } from "class-variance-authority"
import * as React from "react"
import { getLocale } from "@/paraglide/runtime"
import { toast } from "sonner"
import { z } from "zod"
import {
  Ban,
  CalendarClock,
  CalendarRange,
  Clock,
  Footprints,
  Lock,
  Phone,
  Plus,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react"

import { useAppForm, useFormContext } from "@/components/form"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Popover, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  COURT_BLOCK_REASONS,
  addMinutes,
  locStr,
  sportAccent,
} from "@/lib/shared"
import type {
  CourtBlockReason,
  ScheduleEvent,
  SlotKind,
  VenueCourt,
} from "@/lib/shared"
import { useData } from "@/features/dashboard/components/data-provider"
import {
  addDays,
  addMonths,
  dayOfMonth,
  isToday,
  isWeekend,
  mondayIndex,
  monthOf,
  sameMonth,
  weekDays,
  yearOf,
} from "@/features/booking/lib/calendar"
import type { CalendarView } from "@/features/booking/lib/calendar"
import {
  CalendarToolbar,
  MonthGrid,
  PX_PER_MIN,
  Timeline,
  toMin,
  useNow,
} from "@/features/booking/components/calendar-ui"
import type { TimelineColumn } from "@/features/booking/components/calendar-ui"
import {
  useAddCourtBlock,
  useAddWalkInReservation,
  useCancelReservation,
  useRemoveCourtBlock,
  useRescheduleReservation,
  useVenueData,
} from "@/features/venue/api/venue.queries"
import {
  MicroLabel,
  Meter,
  ReasonDialog,
  VenuePanel,
} from "@/features/venue/components/shared"
import { m } from "@/paraglide/messages"

const legendMessages = {
  title: m.venue_schedule_legend_title,
  booked: m.venue_schedule_legend_booked,
  awaiting: m.venue_schedule_legend_awaiting,
  "walk-in": m.venue_schedule_legend_walk_in,
  held: m.venue_schedule_legend_held,
  free: m.venue_schedule_legend_free,
  blocked: m.venue_schedule_legend_blocked,
} as const

const blockReasonsMessages = {
  maintenance: m.venue_schedule_block_reasons_maintenance,
  internal: m.venue_schedule_block_reasons_internal,
  vip: m.venue_schedule_block_reasons_vip,
  break: m.venue_schedule_block_reasons_break,
} as const

const sportsMessages = {
  badminton: m.common_sports_badminton,
} as const

const LEGEND_KINDS: Exclude<SlotKind, "free">[] = [
  "booked",
  "awaiting",
  "walk-in",
  "held",
  "blocked",
]
const LEGEND_ICON: Record<
  Exclude<SlotKind, "free">,
  React.ComponentType<{ className?: string }>
> = {
  booked: Users,
  awaiting: CalendarClock,
  "walk-in": Footprints,
  held: Clock,
  blocked: Wrench,
}

// The generic booking-overlap 409 thrown by `POST /api/venues/reservations/walk-in`
// (see api/src/features/bookings/bookings.service.ts#writeWithOverlapGuard) —
// matched verbatim so the walk-in dialog can swap in the operator-facing copy.
const WALK_IN_OVERLAP_MESSAGE = "Selected time overlaps an existing reservation"

export function VenueScheduleView({
  embedded = false,
  initialDay,
  newBookingNonce = 0,
}: {
  embedded?: boolean
  /** Bumped by the topbar "Đặt sân mới" action to open the walk-in dialog. */
  newBookingNonce?: number
  /** Land the day view on this ISO date instead of today (e.g. a deep link
   * from the Insights cold-slot panel to a specific weekday). */
  initialDay?: string
} = {}) {
  const locale = getLocale()
  const { todayIso } = useData()
  const {
    venueId,
    venue: VENUE,
    venueCourts: VENUE_COURTS,
    reservations: RESERVATIONS,
    blocks: BLOCKS,
    venueStats: stats,
    courtDayEvents,
    venueScheduleFor,
  } = useVenueData()

  // Which schedule events are backed by a real (persistable) reservation — the
  // synthetic seed-filler blocks from `courtDayEvents` are not, so only these
  // get the live Cancel / Reschedule actions.
  const reservationIds = React.useMemo(
    () => new Set(RESERVATIONS.map((r) => r.id)),
    [RESERVATIONS]
  )
  // Same idea for blocked events: only ones backed by a real `CourtBlock`
  // (as opposed to a court's static `maintenance` state) can be reopened.
  const blockIds = React.useMemo(
    () => new Set(BLOCKS.map((b) => b.id)),
    [BLOCKS]
  )

  const now = useNow()
  const [view, setView] = React.useState<CalendarView>("day")
  const [cursor, setCursor] = React.useState<string>(initialDay ?? todayIso)
  // Honor an `initialDay` deep link even after mount: a soft nav to this page
  // with a new `?day=` (e.g. re-clicking Insights' cold-slot link) keeps the
  // client component mounted, so a mount-only initial value would be stale.
  // Adjust during render (not an effect) per the repo's no-sync-setState rule.
  const [prevInitialDay, setPrevInitialDay] = React.useState(initialDay)
  if (initialDay !== prevInitialDay) {
    setPrevInitialDay(initialDay)
    if (initialDay) {
      setCursor(initialDay)
      setView("day")
    }
  }
  const [weekCourtId, setWeekCourtId] = React.useState<string>(
    VENUE_COURTS[0]?.id ?? ""
  )
  const [walkInDialog, setWalkInDialog] = React.useState<SlotTarget | null>(
    null
  )
  const bookableCourts = VENUE_COURTS.filter((c) => c.state !== "maintenance")
  // Open a walk-in dialog where the operator picks court, day and time
  // (no calendar slot was clicked). Adjusted during render per the repo's
  // no-sync-setState-in-effects rule.
  const openNewWalkIn = (dayKey: string) => {
    const court = bookableCourts.at(0) ?? VENUE_COURTS.at(0)
    if (!court) return
    setWalkInDialog({
      courtId: court.id,
      courtName: court.name,
      dayKey,
      start: VENUE.openFrom,
      durationMin: 60,
      pickSlot: true,
    })
  }
  const [prevNonce, setPrevNonce] = React.useState(0)
  if (newBookingNonce !== prevNonce) {
    setPrevNonce(newBookingNonce)
    if (newBookingNonce > 0) openNewWalkIn(cursor)
  }
  const [blockDialog, setBlockDialog] = React.useState<{
    courtId: string
    courtName: string
    dayKey: string
    start: string
    durationMin: number
  } | null>(null)
  const [rescheduleDialog, setRescheduleDialog] = React.useState<{
    reservationId: string
    courtName: string
    dayKey: string
    start: string
    durationMin: number
  } | null>(null)
  const [, startCancel] = React.useTransition()
  const [, startReopen] = React.useTransition()
  const cancelReservationMutation = useCancelReservation(venueId)
  const removeCourtBlockMutation = useRemoveCourtBlock(venueId)
  // The API requires a reason for any cancellation, so Cancel opens this
  // dialog to collect one instead of firing straight from the popover.
  const [cancelTarget, setCancelTarget] = React.useState<ScheduleEvent | null>(
    null
  )

  const requestCancel = React.useCallback((event: ScheduleEvent) => {
    setCancelTarget(event)
  }, [])

  const confirmCancel = React.useCallback(
    (reason: string) => {
      const event = cancelTarget
      if (!event || reason.length < 3) return
      setCancelTarget(null)
      startCancel(async () => {
        try {
          await cancelReservationMutation.mutateAsync({
            id: event.id,
            reason,
          })
          toast(m.venue_schedule_toast_cancelled_event(), {
            description: event.customer,
          })
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Failed to cancel booking"
          )
        }
      })
    },
    [cancelTarget, venueId, cancelReservationMutation]
  )

  // "Mở lại khung giờ" — reopen a real CourtBlock (no reason needed, unlike
  // cancelling a booking). Only wired for blocked events backed by a real
  // block id; the schedule-filler `maintenance` block isn't addressable here.
  const reopenBlock = React.useCallback(
    (event: ScheduleEvent, courtName: string) => {
      startReopen(async () => {
        try {
          await removeCourtBlockMutation.mutateAsync(event.id)
          toast.success(m.venue_schedule_toast_reopened(), {
            description: courtName,
          })
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Failed to reopen slot"
          )
        }
      })
    },
    [venueId, removeCourtBlockMutation]
  )

  const monthsShort = [
    m.calendar_months_short_1(),
    m.calendar_months_short_2(),
    m.calendar_months_short_3(),
    m.calendar_months_short_4(),
    m.calendar_months_short_5(),
    m.calendar_months_short_6(),
    m.calendar_months_short_7(),
    m.calendar_months_short_8(),
    m.calendar_months_short_9(),
    m.calendar_months_short_10(),
    m.calendar_months_short_11(),
    m.calendar_months_short_12(),
  ] as string[]
  const months = [
    m.calendar_months_1(),
    m.calendar_months_2(),
    m.calendar_months_3(),
    m.calendar_months_4(),
    m.calendar_months_5(),
    m.calendar_months_6(),
    m.calendar_months_7(),
    m.calendar_months_8(),
    m.calendar_months_9(),
    m.calendar_months_10(),
    m.calendar_months_11(),
    m.calendar_months_12(),
  ] as string[]
  const weekdaysShort = [
    m.calendar_weekdays_short_1(),
    m.calendar_weekdays_short_2(),
    m.calendar_weekdays_short_3(),
    m.calendar_weekdays_short_4(),
    m.calendar_weekdays_short_5(),
    m.calendar_weekdays_short_6(),
    m.calendar_weekdays_short_7(),
  ] as string[]

  const openStart = toMin(VENUE.openFrom)
  const openEnd = toMin(VENUE.openTo)

  /** Free gaps (complement of the events) within the open window. */
  const gapsOf = React.useCallback(
    (events: ScheduleEvent[]): { start: string; durationMin: number }[] => {
      const sorted = [...events].sort((a, b) => toMin(a.start) - toMin(b.start))
      const bands: { start: string; durationMin: number }[] = []
      let filledTo = openStart
      for (const e of sorted) {
        const s = toMin(e.start)
        if (s > filledTo)
          bands.push({
            start: addMinutes("00:00", filledTo),
            durationMin: s - filledTo,
          })
        filledTo = Math.max(filledTo, s + e.durationMin)
      }
      if (filledTo < openEnd)
        bands.push({
          start: addMinutes("00:00", filledTo),
          durationMin: openEnd - filledTo,
        })
      return bands
    },
    [openStart, openEnd]
  )

  /** Closed-hours shading (before opening / after closing) for one column. */
  const closedShading = (
    <>
      {openStart > 0 ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-0 bg-muted/40"
          style={{ height: openStart * PX_PER_MIN }}
        />
      ) : null}
      {openEnd < 24 * 60 ? (
        <div
          className="pointer-events-none absolute inset-x-0 z-0 bg-muted/40"
          style={{
            top: openEnd * PX_PER_MIN,
            height: (24 * 60 - openEnd) * PX_PER_MIN,
          }}
        />
      ) : null}
    </>
  )

  /** Place one court's events + free gaps on a date into a timeline column. */
  const courtContent = (court: VenueCourt, dateIso: string) => {
    const events = courtDayEvents(court.id, dateIso)
    const gaps = court.state === "maintenance" ? [] : gapsOf(events)
    return (
      <>
        {closedShading}
        {gaps.map((g) => (
          <FreeBand
            key={`${court.id}-${dateIso}-${g.start}`}
            courtId={court.id}
            courtName={court.name}
            dayKey={dateIso}
            start={g.start}
            durationMin={g.durationMin}
            onAddWalkIn={(input) => setWalkInDialog(input)}
            onBlockCourt={(input) => setBlockDialog(input)}
          />
        ))}
        {events.map((ev) => (
          <EventBlock
            key={ev.id}
            event={ev}
            courtName={court.name}
            persisted={
              ev.kind === "blocked"
                ? blockIds.has(ev.id)
                : reservationIds.has(ev.id)
            }
            locale={locale}
            onCancel={requestCancel}
            onReopen={() => reopenBlock(ev, court.name)}
            onReschedule={() =>
              setRescheduleDialog({
                reservationId: ev.id,
                courtName: court.name,
                dayKey: dateIso,
                start: ev.start,
                durationMin: ev.durationMin,
              })
            }
          />
        ))}
      </>
    )
  }

  // Columns: Day = one per court (cursor date); Week = one per day (selected court).
  const weekCourt =
    VENUE_COURTS.find((c) => c.id === weekCourtId) ?? VENUE_COURTS.at(0)

  const columns: TimelineColumn[] = (() => {
    if (view === "day") {
      const today = isToday(cursor, todayIso)
      return VENUE_COURTS.map((court) => ({
        key: court.id,
        today,
        header: (
          <div>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  sportAccent(court.sport)
                )}
                aria-hidden
              />
              <span className="truncate text-sm font-semibold">
                {court.name}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <Meter pct={court.utilToday} className="h-1" />
              <span className="font-mono text-micro text-muted-foreground tabular-nums">
                {court.utilToday}%
              </span>
            </div>
          </div>
        ),
        content: courtContent(court, cursor),
      }))
    }
    if (view === "week" && weekCourt) {
      return weekDays(cursor).map((iso) => ({
        key: iso,
        today: isToday(iso, todayIso),
        weekend: isWeekend(iso),
        header: (
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 truncate text-sm font-semibold",
                isToday(iso, todayIso) && "text-brand"
              )}
            >
              <span className="text-muted-foreground">
                {weekdaysShort[mondayIndex(iso)]}
              </span>
              <span
                className={cn(
                  "tabular-nums",
                  isToday(iso, todayIso) &&
                    "grid size-6 place-items-center rounded-full bg-brand text-brand-foreground"
                )}
              >
                {dayOfMonth(iso)}
              </span>
            </span>
          </div>
        ),
        content: courtContent(weekCourt, iso),
      }))
    }
    return []
  })()

  // Day summary (occupancy / booked / free) for the cursor date.
  const summary = React.useMemo(() => {
    const grid = venueScheduleFor(cursor)
    let bookable = 0
    let filled = 0
    let free = 0
    for (const row of grid) {
      for (const slot of row) {
        if (slot.kind === "blocked") continue
        bookable++
        if (slot.kind === "free") free++
        else filled++
      }
    }
    return {
      bookable,
      free,
      filled,
      occupancy: bookable ? Math.round((filled / bookable) * 100) : 0,
    }
  }, [cursor, venueScheduleFor])

  /** Venue occupancy % on a date (drives the month heat). */
  const occupancyOn = React.useCallback(
    (iso: string) => {
      const grid = venueScheduleFor(iso)
      let bookable = 0
      let filled = 0
      for (const row of grid)
        for (const slot of row) {
          if (slot.kind === "blocked") continue
          bookable++
          if (slot.kind !== "free") filled++
        }
      return bookable ? Math.round((filled / bookable) * 100) : 0
    },
    [venueScheduleFor]
  )

  const periodLabel = React.useMemo(() => {
    if (view === "month") return `${months[monthOf(cursor)]} ${yearOf(cursor)}`
    if (view === "day")
      return `${weekdaysShort[mondayIndex(cursor)]}, ${dayOfMonth(cursor)} ${
        monthsShort[monthOf(cursor)]
      }`
    const days = weekDays(cursor)
    const a = days[0]
    const b = days[6]
    return sameMonth(a, b)
      ? `${dayOfMonth(a)}–${dayOfMonth(b)} ${monthsShort[monthOf(a)]}`
      : `${dayOfMonth(a)} ${monthsShort[monthOf(a)]} – ${dayOfMonth(b)} ${
          monthsShort[monthOf(b)]
        }`
  }, [view, cursor, months, monthsShort, weekdaysShort])

  const showsToday =
    view === "month"
      ? sameMonth(cursor, todayIso)
      : view === "week"
        ? weekDays(cursor).includes(todayIso)
        : isToday(cursor, todayIso)

  const step = (dir: -1 | 1) =>
    setCursor((c) =>
      view === "day"
        ? addDays(c, dir)
        : view === "week"
          ? addDays(c, dir * 7)
          : addMonths(c, dir)
    )

  const openDay = (iso: string) => {
    setCursor(iso)
    setView("day")
  }

  const activeDay = isToday(cursor, todayIso)

  return (
    <div className="flex flex-col gap-5">
      {!embedded ? (
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {m.venue_schedule_title()}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {m.venue_schedule_subtitle({ day: periodLabel })}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryChip
          label={m.venue_schedule_summary_occupancy()}
          value={`${summary.occupancy}`}
          unit="%"
        >
          <Meter pct={summary.occupancy} className="mt-1" />
        </SummaryChip>
        <SummaryChip
          label={m.venue_schedule_summary_booked()}
          value={`${summary.filled}`}
          hint={m.venue_schedule_summary_of_slots({ count: summary.bookable })}
        />
        <SummaryChip
          label={m.venue_schedule_summary_free()}
          value={`${summary.free}`}
          hint={m.venue_schedule_summary_open_to_sell()}
          tone="brand"
        />
        <SummaryChip
          label={m.venue_schedule_summary_day_util()}
          value={`${stats.utilization}`}
          unit="%"
          hint={m.venue_schedule_summary_trailing7()}
        />
      </div>

      <VenuePanel
        title={m.venue_schedule_grid_title()}
        icon={CalendarRange}
        action={
          activeDay && now ? (
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
              <span className="relative flex size-2">
                <span className="animate-pulse-ring absolute inline-flex size-full rounded-full bg-brand/60" />
                <span className="relative inline-flex size-2 rounded-full bg-brand" />
              </span>
              {m.venue_schedule_grid_live_at({ time: now })}
            </span>
          ) : null
        }
      >
        <CalendarToolbar
          periodLabel={periodLabel}
          view={view}
          onView={setView}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onToday={() => setCursor(todayIso)}
          live={
            showsToday && now
              ? m.venue_schedule_grid_live_at({ time: now })
              : null
          }
        />

        {/* Court picker (week view shows one court across the week) */}
        {view === "week" ? (
          <div className="-mx-1 no-scrollbar flex gap-1.5 overflow-x-auto px-1 pb-1">
            {VENUE_COURTS.map((court) => {
              const active = court.id === weekCourt?.id
              return (
                <button
                  key={court.id}
                  type="button"
                  onClick={() => setWeekCourtId(court.id)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                    active
                      ? "bg-brand/12 text-brand ring-brand/25"
                      : "text-muted-foreground ring-border hover:bg-muted/60"
                  )}
                >
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      sportAccent(court.sport)
                    )}
                    aria-hidden
                  />
                  {court.name}
                </button>
              )
            })}
          </div>
        ) : null}

        {view === "month" ? (
          <MonthGrid
            cursor={cursor}
            todayIso={todayIso}
            onPickDay={openDay}
            renderDay={(iso, inMonth) =>
              inMonth ? (
                <div className="mt-auto flex w-full flex-col gap-1">
                  <span className="hidden font-mono text-micro text-muted-foreground tabular-nums sm:block">
                    {occupancyOn(iso)}%
                  </span>
                  <Meter pct={occupancyOn(iso)} className="h-1" />
                </div>
              ) : null
            }
          />
        ) : (
          <Timeline
            columns={columns}
            now={now}
            single={columns.length === 1}
            scrollKey={`${view}:${cursor}:${weekCourtId}`}
            minColPx={120}
          />
        )}

        {view !== "month" ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 pt-3">
            <MicroLabel className="mr-1">
              {m.venue_schedule_legend_title()}
            </MicroLabel>
            {LEGEND_KINDS.map((kind) => {
              const Icon = LEGEND_ICON[kind]
              return (
                <span
                  key={kind}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <span
                    className={cn(
                      "grid size-4 place-items-center rounded-md ring-1",
                      slotKindVariants({ kind })
                    )}
                  >
                    <Icon className="size-2.5" />
                  </span>
                  {legendMessages[kind]()}
                </span>
              )
            })}
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-0 w-4 border-t-2 border-brand" />
              {m.venue_schedule_grid_now()}
            </span>
          </div>
        ) : null}
      </VenuePanel>

      <WalkInDialog
        venueId={venueId}
        courts={bookableCourts}
        reservation={walkInDialog}
        onClose={() => setWalkInDialog(null)}
      />

      <BlockDialog
        venueId={venueId}
        target={blockDialog}
        onClose={() => setBlockDialog(null)}
      />

      <RescheduleDialog
        locale={locale}
        venueId={venueId}
        reservation={rescheduleDialog}
        onClose={() => setRescheduleDialog(null)}
      />

      <ReasonDialog
        open={cancelTarget !== null}
        onOpenChange={(o) => {
          if (!o) setCancelTarget(null)
        }}
        title={m.venue_schedule_cancel_dialog_title()}
        description={m.venue_schedule_cancel_dialog_description({
          name: cancelTarget?.customer ?? "",
        })}
        reasonLabel={m.venue_schedule_cancel_dialog_reason_label()}
        reasonPlaceholder={m.venue_schedule_cancel_dialog_reason_placeholder()}
        cancelLabel={m.venue_schedule_cancel_dialog_cancel()}
        confirmLabel={m.venue_schedule_cancel_dialog_confirm()}
        onConfirm={confirmCancel}
      />
    </div>
  )
}

/** A booked / walk-in / maintenance block, sized to its real duration. */
const slotKindVariants = cva("", {
  variants: {
    kind: {
      booked: "bg-brand/15 text-brand ring-brand/20",
      "walk-in": "bg-lime/20 text-brand ring-lime/30",
      // An unpaid hold: muted amber so the operator reads it as "occupied, awaiting
      // payment" — visibly held, but not the solid `booked` tint of a paid slot.
      held: "bg-chart-3/12 text-chart-3 ring-chart-3/25",
      // Payment proof submitted; awaiting venue confirmation — orange so it reads
      // as urgent/actionable for the operator (distinct from the muted hold above).
      awaiting:
        "bg-orange-500/12 text-orange-600 ring-orange-500/20 dark:text-orange-400",
      blocked:
        "bg-destructive/10 bg-slot-stripes text-destructive/80 ring-destructive/15",
      free: "bg-muted/40 text-muted-foreground/50 ring-transparent hover:bg-muted",
    },
  },
})

function EventBlock({
  event,
  courtName,
  persisted,
  locale,
  onCancel,
  onReschedule,
  onReopen,
}: {
  event: ScheduleEvent
  courtName: string
  /**
   * True when the event is backed by a real record (a reservation for
   * booked/walk-in kinds, a `CourtBlock` for blocked ones) — so the live
   * Cancel / Reschedule / Reopen actions persist. False for the seed-filler
   * events `courtDayEvents` synthesizes and the static `maintenance` block.
   */
  persisted: boolean
  locale: string
  onCancel: (event: ScheduleEvent) => void
  onReschedule: (event: ScheduleEvent) => void
  onReopen: (event: ScheduleEvent) => void
}) {
  const top = toMin(event.start) * PX_PER_MIN
  const height = Math.max(18, event.durationMin * PX_PER_MIN - 2)
  const end = addMinutes(event.start, event.durationMin)
  const compact = height < 46
  const blocked = event.kind === "blocked"
  const Icon =
    event.kind === "walk-in"
      ? Footprints
      : event.kind === "held"
        ? Clock
        : event.kind === "awaiting"
          ? CalendarClock
          : Users
  const infoCopy =
    locale === "vi"
      ? {
          customer: "Khách đặt sân",
          phone: "Số điện thoại",
          noPhone: "Chưa có số điện thoại",
        }
      : {
          customer: "Customer",
          phone: "Phone",
          noPhone: "No phone number",
        }

  return (
    <div className="absolute inset-x-1 z-10" style={{ top: top + 1, height }}>
      <PopoverTrigger>
        <Button
          variant="ghost"
          className={cn(
            "h-auto justify-start font-normal whitespace-normal",
            "flex h-full w-full flex-col gap-0.5 overflow-hidden rounded-lg px-2 py-1 text-left ring-1 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
            slotKindVariants({ kind: event.kind }),
            event.past && "opacity-45"
          )}
        >
          {blocked ? (
            <span className="inline-flex items-center gap-1 text-mini font-semibold">
              <Lock className="size-3 shrink-0" />
              {m.venue_schedule_event_maintenance()}
            </span>
          ) : (
            <>
              <span className="truncate text-mini leading-tight font-semibold">
                {event.customer}
              </span>
              {!compact ? (
                <>
                  <span className="font-mono text-micro leading-none tabular-nums opacity-80">
                    {event.start} – {end}
                  </span>
                  <span className="inline-flex items-center gap-1 text-micro leading-none opacity-80">
                    <Icon className="size-2.5" />
                    {event.party}
                  </span>
                </>
              ) : null}
            </>
          )}
        </Button>
        <Popover placement="bottom start" className="w-60 p-3">
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {blocked
                    ? m.venue_schedule_event_maintenance()
                    : event.customer}
                </p>
                <p className="text-xs text-muted-foreground">
                  {courtName} · {sportsMessages[event.sport]()}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-micro font-semibold ring-1",
                  slotKindVariants({ kind: event.kind })
                )}
              >
                {legendMessages[event.kind]()}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-muted/50 px-3 py-2 text-sm">
              <span className="font-mono tabular-nums">
                {event.start} – {end}
              </span>
              {!blocked ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Icon className="size-3.5" />
                  {event.party}
                </span>
              ) : null}
            </div>

            {blocked ? (
              <div className="flex flex-col gap-1.5">
                {event.blockReason ? (
                  <div className="rounded-2xl bg-muted/50 px-3 py-2 text-sm">
                    <div className="text-mini font-semibold tracking-wide text-muted-foreground uppercase">
                      {m.venue_schedule_block_dialog_reason_label()}
                    </div>
                    <div className="mt-1 font-medium">
                      {blockReasonsMessages[event.blockReason]()}
                    </div>
                    {event.blockNote ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {event.blockNote}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <Button
                  shape="pill"
                  size="sm"
                  variant="outline"
                  className="w-full justify-start"
                  isDisabled={!persisted}
                  onPress={() => onReopen(event)}
                >
                  <Wrench />
                  {m.venue_schedule_event_reopen()}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="rounded-2xl bg-muted/50 px-3 py-2 text-sm">
                  <div className="text-mini font-semibold tracking-wide text-muted-foreground uppercase">
                    {infoCopy.customer}
                  </div>
                  <div className="mt-1 font-medium">{event.customer}</div>
                  <div className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Phone className="size-3.5" />
                    <span>{event.customerPhone ?? infoCopy.noPhone}</span>
                  </div>
                </div>
                <Button
                  shape="pill"
                  size="sm"
                  variant="outline"
                  className="w-full justify-start"
                  isDisabled={!persisted}
                  onPress={() => onReschedule(event)}
                >
                  <CalendarClock />
                  {m.venue_schedule_event_reschedule()}
                </Button>
                <Button
                  shape="pill"
                  size="sm"
                  variant="ghost"
                  className="w-full justify-start text-destructive"
                  isDisabled={!persisted}
                  onPress={() => onCancel(event)}
                >
                  <Ban />
                  {m.venue_schedule_event_cancel()}
                </Button>
              </div>
            )}
          </div>
        </Popover>
      </PopoverTrigger>
    </div>
  )
}

interface SlotTarget {
  courtId: string
  courtName: string
  dayKey: string
  start: string
  durationMin: number
  /** Let the operator choose the court and day in the walk-in form. */
  pickSlot?: boolean
}

const timeField = z.string().regex(/^\d{2}:\d{2}$/)
const durationField = z.number().int().min(15)

function DialogActions({
  onCancel,
  submit,
}: {
  onCancel: () => void
  submit: string
}) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onPress={onCancel}>
        {m.venue_schedule_form_cancel()}
      </Button>
      <FormSubmit label={submit} />
    </DialogFooter>
  )
}

function FormSubmit({ label }: { label: string }) {
  const form = useFormContext()
  return (
    <form.Subscribe
      selector={(state) => [state.canSubmit, state.isSubmitting] as const}
    >
      {([canSubmit, isSubmitting]) => (
        <Button type="submit" isDisabled={!canSubmit || isSubmitting}>
          {isSubmitting ? m.venue_schedule_form_saving() : label}
        </Button>
      )}
    </form.Subscribe>
  )
}

const walkInSchema = z.object({
  courtId: z.string().min(1),
  dayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  start: timeField,
  durationMin: durationField,
})

function WalkInDialog({
  venueId,
  courts,
  reservation,
  onClose,
}: {
  venueId: string
  courts: { id: string; name: string }[]
  reservation: SlotTarget | null
  onClose: () => void
}) {
  return (
    <Dialog
      isOpen={reservation !== null}
      onOpenChange={(open) => !open && onClose()}
      className="sm:max-w-md"
    >
      <DialogHeader>
        <DialogTitle>{m.venue_schedule_walk_in_title()}</DialogTitle>
        <DialogDescription>
          {m.venue_schedule_walk_in_description()}
        </DialogDescription>
      </DialogHeader>
      {reservation ? (
        <WalkInForm
          key={`${reservation.courtId}-${reservation.dayKey}-${reservation.start}`}
          venueId={venueId}
          courts={courts}
          target={reservation}
          onClose={onClose}
        />
      ) : null}
    </Dialog>
  )
}

function WalkInForm({
  venueId,
  courts,
  target,
  onClose,
}: {
  venueId: string
  courts: { id: string; name: string }[]
  target: SlotTarget
  onClose: () => void
}) {
  const addWalkIn = useAddWalkInReservation(venueId)
  const form = useAppForm({
    defaultValues: {
      courtId: target.courtId,
      dayKey: target.dayKey,
      name: "",
      phone: "",
      start: target.start,
      durationMin: Math.max(15, target.durationMin),
    },
    validators: { onChange: walkInSchema },
    onSubmit: async ({ value }) => {
      try {
        const courtName =
          courts.find((c) => c.id === value.courtId)?.name ?? target.courtName
        const created = await addWalkIn.mutateAsync({
          courtId: value.courtId,
          dayKey: value.dayKey,
          start: value.start,
          durationMin: value.durationMin,
          customerName: value.name,
          customerPhone: value.phone,
        })
        toast.success(m.venue_schedule_toast_walk_in_title(), {
          description: `${courtName} · ${created.time}`,
        })
        onClose()
      } catch (error) {
        // The API's generic overlap 409 ("Selected time overlaps an existing
        // reservation") almost always means a pending/confirmed app booking
        // already sits on this slot — surface the operator-facing explanation
        // instead of the raw API string.
        const message =
          error instanceof Error ? error.message : "Failed to add walk-in"
        toast.error(
          message === WALK_IN_OVERLAP_MESSAGE
            ? m.venue_schedule_toast_walk_in_conflict()
            : message
        )
      }
    },
  })

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      {target.pickSlot ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <form.Field name="courtId">
            {(field) => (
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {m.venue_courts_col_name()}
                <select
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                >
                  {courts.map((court) => (
                    <option key={court.id} value={court.id}>
                      {court.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </form.Field>
          <form.AppField name="dayKey">
            {(field) => (
              <field.TextField
                label={m.venue_schedule_form_day()}
                type="date"
              />
            )}
          </form.AppField>
        </div>
      ) : (
        <form.Subscribe selector={(state) => state.values.start}>
          {(start) => (
            <div className="rounded-2xl bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {target.courtName} · {start}
            </div>
          )}
        </form.Subscribe>
      )}
      <form.AppField name="name">
        {(field) => <field.TextField label={m.venue_schedule_walk_in_name()} />}
      </form.AppField>
      <form.AppField name="phone">
        {(field) => (
          <field.TextField
            label={m.venue_schedule_walk_in_phone()}
            type="tel"
          />
        )}
      </form.AppField>
      <div className="grid gap-3 sm:grid-cols-2">
        <form.AppField name="start">
          {(field) => (
            <field.TextField
              label={m.venue_schedule_form_start()}
              type="time"
              step={900}
            />
          )}
        </form.AppField>
        <form.Field name="durationMin">
          {(field) => (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {m.venue_schedule_form_duration()}
              <Input
                min={15}
                step={15}
                type="number"
                value={String(field.state.value)}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(Number(e.target.value))}
              />
            </label>
          )}
        </form.Field>
      </div>
      <form.AppForm>
        <DialogActions
          onCancel={onClose}
          submit={m.venue_schedule_walk_in_submit()}
        />
      </form.AppForm>
    </form>
  )
}

/**
 * Close off a free slot with a required reason (VienTD-Review decision #12) —
 * "maintenance/internal/vip/break", never inferred. Reopening is a direct
 * action on the blocked `EventBlock` popover, no dialog needed.
 */
const blockSchema = z.object({
  reason: z.custom<CourtBlockReason>(),
  note: z.string(),
  start: timeField,
  durationMin: durationField,
})

function BlockDialog({
  venueId,
  target,
  onClose,
}: {
  venueId: string
  target: SlotTarget | null
  onClose: () => void
}) {
  return (
    <Dialog
      isOpen={target !== null}
      onOpenChange={(open) => !open && onClose()}
      className="sm:max-w-md"
    >
      <DialogHeader>
        <DialogTitle>{m.venue_schedule_block_dialog_title()}</DialogTitle>
        <DialogDescription>
          {m.venue_schedule_block_dialog_description()}
        </DialogDescription>
      </DialogHeader>
      {target ? (
        <BlockForm
          key={`${target.courtId}-${target.dayKey}-${target.start}`}
          venueId={venueId}
          target={target}
          onClose={onClose}
        />
      ) : null}
    </Dialog>
  )
}

function BlockForm({
  venueId,
  target,
  onClose,
}: {
  venueId: string
  target: SlotTarget
  onClose: () => void
}) {
  const addBlockMutation = useAddCourtBlock(venueId)
  const form = useAppForm({
    defaultValues: {
      reason: "maintenance" as CourtBlockReason,
      note: "",
      start: target.start,
      durationMin: Math.max(15, target.durationMin),
    },
    validators: { onChange: blockSchema },
    onSubmit: async ({ value }) => {
      try {
        await addBlockMutation.mutateAsync({
          courtId: target.courtId,
          dateKey: target.dayKey,
          start: value.start,
          durationMin: value.durationMin,
          reason: value.reason,
          note: value.note.trim() || undefined,
        })
        toast.success(m.venue_schedule_toast_block_title(), {
          description: `${target.courtName} · ${value.start}`,
        })
        onClose()
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to block slot"
        )
      }
    },
  })

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Subscribe selector={(state) => state.values.start}>
        {(start) => (
          <div className="rounded-2xl bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {target.courtName} · {start}
          </div>
        )}
      </form.Subscribe>
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
      <div className="grid gap-3 sm:grid-cols-2">
        <form.AppField name="start">
          {(field) => (
            <field.TextField
              label={m.venue_schedule_form_start()}
              type="time"
              step={900}
            />
          )}
        </form.AppField>
        <form.Field name="durationMin">
          {(field) => (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {m.venue_schedule_form_duration()}
              <Input
                min={15}
                step={15}
                type="number"
                value={String(field.state.value)}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(Number(e.target.value))}
              />
            </label>
          )}
        </form.Field>
      </div>
      <form.AppField name="note">
        {(field) => (
          <field.TextField
            label={m.venue_schedule_block_dialog_note_label()}
            placeholder={m.venue_schedule_block_dialog_note_placeholder()}
          />
        )}
      </form.AppField>
      <form.AppForm>
        <DialogActions
          onCancel={onClose}
          submit={m.venue_schedule_block_dialog_submit()}
        />
      </form.AppForm>
    </form>
  )
}

const rescheduleSchema = z.object({
  dayKey: z.string().min(1),
  start: timeField,
  durationMin: durationField,
})

interface RescheduleTarget {
  reservationId: string
  courtName: string
  dayKey: string
  start: string
  durationMin: number
}

function RescheduleDialog({
  locale,
  venueId,
  reservation,
  onClose,
}: {
  locale: string
  venueId: string
  reservation: RescheduleTarget | null
  onClose: () => void
}) {
  return (
    <Dialog
      isOpen={reservation !== null}
      onOpenChange={(open) => !open && onClose()}
      className="sm:max-w-md"
    >
      <DialogHeader>
        <DialogTitle>{m.venue_schedule_reschedule_title()}</DialogTitle>
        <DialogDescription>
          {m.venue_schedule_reschedule_description()}
        </DialogDescription>
      </DialogHeader>
      {reservation ? (
        <RescheduleForm
          key={reservation.reservationId}
          locale={locale}
          venueId={venueId}
          target={reservation}
          onClose={onClose}
        />
      ) : null}
    </Dialog>
  )
}

function RescheduleForm({
  locale,
  venueId,
  target,
  onClose,
}: {
  locale: string
  venueId: string
  target: RescheduleTarget
  onClose: () => void
}) {
  const { bookingDays } = useData()
  const reschedule = useRescheduleReservation(venueId)
  const form = useAppForm({
    defaultValues: {
      dayKey: target.dayKey,
      start: target.start,
      durationMin: Math.max(15, target.durationMin),
    },
    validators: { onChange: rescheduleSchema },
    onSubmit: async ({ value }) => {
      try {
        const updated = await reschedule.mutateAsync({
          id: target.reservationId,
          input: value,
        })
        toast.success(m.venue_schedule_toast_rescheduled(), {
          description: `${target.courtName} · ${updated.time}`,
        })
        onClose()
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to reschedule"
        )
      }
    },
  })

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <div className="rounded-2xl bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        {target.courtName}
      </div>
      <form.Field name="dayKey">
        {(field) => (
          <Select
            className="flex flex-col gap-1.5 text-sm font-medium"
            value={field.state.value}
            onChange={(v) => {
              if (typeof v === "string") field.handleChange(v)
            }}
          >
            <Label>{m.venue_schedule_form_day()}</Label>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {bookingDays.map((day) => (
                <SelectItem key={day.key} id={day.key}>
                  {locStr(day.label, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </form.Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <form.AppField name="start">
          {(field) => (
            <field.TextField
              label={m.venue_schedule_form_start()}
              type="time"
              step={900}
            />
          )}
        </form.AppField>
        <form.Field name="durationMin">
          {(field) => (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {m.venue_schedule_form_duration()}
              <Input
                min={15}
                step={15}
                type="number"
                value={String(field.state.value)}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(Number(e.target.value))}
              />
            </label>
          )}
        </form.Field>
      </div>
      <form.AppForm>
        <DialogActions
          onCancel={onClose}
          submit={m.venue_schedule_reschedule_submit()}
        />
      </form.AppForm>
    </form>
  )
}

/** A free gap — subtle until hovered, click to add a walk-in or block it. */
function FreeBand({
  courtId,
  courtName,
  dayKey,
  start,
  durationMin,
  onAddWalkIn,
  onBlockCourt,
}: {
  courtId: string
  courtName: string
  dayKey: string
  start: string
  durationMin: number
  onAddWalkIn: (input: {
    courtId: string
    courtName: string
    dayKey: string
    start: string
    durationMin: number
  }) => void
  onBlockCourt: (input: {
    courtId: string
    courtName: string
    dayKey: string
    start: string
    durationMin: number
  }) => void
}) {
  const top = toMin(start) * PX_PER_MIN
  const height = durationMin * PX_PER_MIN
  if (height < 16) return null
  const slotLabel = m.venue_schedule_popover_slot({
    court: courtName,
    hour: start,
  })

  return (
    <div className="absolute inset-x-1 z-0" style={{ top, height }}>
      <PopoverTrigger>
        <Button
          variant="ghost"
          className={cn(
            "h-auto justify-start font-normal whitespace-normal",
            "group/free flex h-full w-full items-center justify-center rounded-lg text-muted-foreground/0 transition-colors hover:bg-muted/50 hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          )}
        >
          <Plus className="size-3.5" />
        </Button>
        <Popover placement="bottom start" className="w-56 p-3">
          <div className="flex flex-col gap-3">
            <div>
              <MicroLabel>{m.venue_schedule_popover_title()}</MicroLabel>
              <p className="mt-0.5 text-sm font-semibold">{slotLabel}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Button
                shape="pill"
                size="sm"
                className="w-full justify-start"
                onPress={() =>
                  onAddWalkIn({
                    courtId,
                    courtName,
                    dayKey,
                    start,
                    durationMin: Math.min(60, Math.max(15, durationMin)),
                  })
                }
              >
                <Plus />
                {m.venue_schedule_popover_add_walk_in()}
              </Button>
              <Button
                shape="pill"
                size="sm"
                variant="outline"
                className="w-full justify-start"
                onPress={() =>
                  onBlockCourt({
                    courtId,
                    courtName,
                    dayKey,
                    start,
                    durationMin,
                  })
                }
              >
                <Wrench />
                {m.venue_schedule_popover_block_court()}
              </Button>
              <Button
                shape="pill"
                size="sm"
                variant="ghost"
                className="w-full justify-start text-muted-foreground"
                onPress={() =>
                  toast(m.venue_schedule_toast_suggest_title(), {
                    description: slotLabel,
                  })
                }
              >
                <Sparkles />
                {m.venue_schedule_popover_suggest_fill()}
              </Button>
            </div>
          </div>
        </Popover>
      </PopoverTrigger>
    </div>
  )
}

/** Inline summary stat chip for the day header strip. */
function SummaryChip({
  label,
  value,
  unit,
  hint,
  tone = "default",
  children,
}: {
  label: string
  value: string
  unit?: string
  hint?: string
  tone?: "default" | "brand"
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-4xl bg-card p-5 shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
      <MicroLabel>{label}</MicroLabel>
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "font-heading text-3xl leading-none font-bold tracking-tight tabular-nums",
            tone === "brand" && "text-brand"
          )}
        >
          {value}
        </span>
        {unit ? (
          <span className="text-sm font-medium text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </div>
      {children}
      {hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  )
}
