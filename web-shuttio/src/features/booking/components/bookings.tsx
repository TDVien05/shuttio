import { cva } from "class-variance-authority"
import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import * as React from "react"
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  LayoutGrid,
  MapPin,
  MessageSquare,
  Plus,
  RotateCcw,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react"
import { getLocale } from "@/paraglide/runtime"
import { toast } from "sonner"
import { openVenueChat } from "@/features/chat/api/chat-api"

import { cn } from "@/lib/utils"
import { queryKeys } from "@/lib/query-keys"
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarGroup } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverTrigger } from "@/components/ui/popover"
import {
  addMinutes,
  durationOf,
  formatVndFull,
  locStr,
  sportAccent,
} from "@/lib/shared"
import type { Booking, BookingStatus } from "@/lib/shared"
import { useData } from "@/features/dashboard/components/data-provider"
import {
  addDays,
  addMonths,
  dayOfMonth,
  isPastDay,
  isToday,
  isWeekend,
  mondayIndex,
  monthMatrix,
  monthOf,
  sameMonth,
  weekDays,
  yearOf,
} from "@/features/booking/lib/calendar"
import type { CalendarView } from "@/features/booking/lib/calendar"
import {
  MonthGrid,
  PX_PER_MIN,
  Timeline,
  toMin,
  useNow,
} from "@/features/booking/components/calendar-ui"
import type { TimelineColumn } from "@/features/booking/components/calendar-ui"
import { useBooking } from "@/features/booking/components/booking"
import { confirmRefundReceipt } from "@/features/booking/api/payment-api"
import { SportTag, dayWordLabel } from "@/features/dashboard/components/shared"
import { NewBookingAction } from "@/features/dashboard/components/section-actions"
import { m } from "@/paraglide/messages"

const viewsMessages = {
  day: m.calendar_views_day,
  week: m.calendar_views_week,
  month: m.calendar_views_month,
} as const

const statusMessages = {
  confirmed: m.common_status_confirmed,
  pending: m.common_status_pending,
  completed: m.common_status_completed,
  cancelled: m.common_status_cancelled,
} as const

const sportsMessages = {
  badminton: m.common_sports_badminton,
} as const

const DAY_MIN = 24 * 60

const UPCOMING: BookingStatus[] = ["confirmed", "pending"]

const isAwaitingPayment = (booking: Booking) =>
  booking.paymentStatus === "awaiting"

/** Tint + ring per booking status, used for the calendar event blocks. */
const bookingAccentVariants = cva("", {
  variants: {
    status: {
      confirmed: "bg-electric text-white ring-electric",
      pending: "bg-warn-soft text-warn-ink ring-warn-line",
      completed: "bg-surface-gray text-ink-muted ring-line-neutral",
      cancelled: "bg-danger-soft text-danger/80 ring-danger-line",
    },
  },
})

/** "Sân 3" for a seeded "Court 3", else the stored court name as-is. */
function useCourtLabel() {
  return (court: string) => {
    const n = court.match(/^Court (\d+)$/)?.[1]
    return n ? m.bookings_court_label({ n }) : court
  }
}

/** Blue date tile (month · big lime day · optional caption) used across the page. */
function DateTile({
  iso,
  caption,
  size = "md",
  className,
}: {
  iso: string | undefined
  caption?: string
  size?: "sm" | "md"
  className?: string
}) {
  const locale = getLocale()
  const date = iso ? new Date(`${iso}T00:00:00`) : null
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-2xl bg-electric text-center text-white",
        size === "sm" ? "size-14" : "w-18 py-2.5",
        className
      )}
    >
      <span className="text-micro leading-none font-semibold tracking-wide uppercase opacity-80">
        {date
          ? new Intl.DateTimeFormat(locale, { month: "short" }).format(date)
          : ""}
      </span>
      <span
        className={cn(
          "font-heading leading-none font-black text-volt tabular-nums",
          size === "sm" ? "text-xl" : "mt-0.5 text-3xl"
        )}
      >
        {date ? date.getDate() : "—"}
      </span>
      {caption ? (
        <span className="mt-1 font-mono text-micro leading-none tabular-nums opacity-80">
          {caption}
        </span>
      ) : null}
    </div>
  )
}

/** The soonest upcoming game, front and centre — tap to jump the calendar to it. */
function NextUpCard({
  booking,
  onView,
}: {
  booking: Booking | null
  onView: (iso: string) => void
}) {
  const courtLabel = useCourtLabel()

  return (
    <section className="relative isolate order-1 shrink-0 overflow-hidden rounded-3xl bg-electric p-5 text-white shadow-electric-glow lg:order-none">
      {/* Shuttle-court motif */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-12 -right-12 -z-10 size-40 rounded-full border-thick-18 border-volt/20"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-4 -bottom-16 -z-10 size-28 rounded-full bg-white/5"
      />

      <p className="text-mini font-bold tracking-eyebrow text-volt uppercase">
        {m.bookings_next_up_title()}
      </p>

      {booking ? (
        <>
          <div className="mt-4 flex items-center gap-4">
            <DateTile
              iso={booking.dayKey}
              className="bg-white/12 ring-1 ring-white/20"
            />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 font-heading text-lg leading-snug font-black">
                {booking.venue}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-white/80">
                <Clock className="size-3.5 shrink-0" />
                <span className="font-mono tabular-nums">{booking.time}</span>
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/80">
                <MapPin className="size-3.5 shrink-0" />
                <span className="truncate">{courtLabel(booking.court)}</span>
              </p>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between gap-2">
            <span className="rounded-full bg-white/15 px-3 py-1 text-mini font-semibold">
              {isAwaitingPayment(booking)
                ? m.bookings_unpaid()
                : statusMessages[booking.status]()}
            </span>
            {booking.dayKey ? (
              <button
                type="button"
                onClick={() => onView(booking.dayKey as string)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-volt px-4 text-xs font-bold text-electric-deep transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt"
              >
                <CalendarDays className="size-4" />
                {m.bookings_next_up_view()}
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-white/85">
          {m.bookings_next_up_empty()}
        </p>
      )}
    </section>
  )
}

/** Compact stat tile in the left rail. */
function StatTile({
  label,
  value,
  brand = false,
}: {
  label: string
  value: number
  brand?: boolean
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-2xl px-3.5 py-3",
        brand ? "bg-volt text-electric-deep" : "bg-surface-cool"
      )}
    >
      <span
        className={cn(
          "text-mini font-semibold",
          brand ? "text-electric-deep/80" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
      <span className="font-heading text-2xl leading-none font-black tabular-nums">
        {value}
      </span>
    </div>
  )
}

const VIEWS: { key: CalendarView; icon: typeof CalendarDays }[] = [
  { key: "day", icon: CalendarDays },
  { key: "week", icon: CalendarRange },
  { key: "month", icon: LayoutGrid },
]

/**
 * Player-styled calendar toolbar — lime-ringed round nav (as on the Book
 * wizard's day picker) and a pill Day/Week/Month switch (as on Play's tabs).
 */
function BookingsToolbar({
  periodLabel,
  view,
  onView,
  onPrev,
  onNext,
  onToday,
  live,
}: {
  periodLabel: string
  view: CalendarView
  onView: (v: CalendarView) => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  live: string | null
}) {
  const navBtn =
    "grid size-9 shrink-0 place-items-center rounded-full border-2 border-lime text-brand transition-colors hover:bg-lime/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          aria-label={m.calendar_prev()}
          className={navBtn}
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          type="button"
          onClick={onToday}
          className="h-9 shrink-0 rounded-full border-2 border-lime px-4 text-sm font-semibold text-brand transition-colors hover:bg-lime/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {m.calendar_today()}
        </button>
        <button
          type="button"
          onClick={onNext}
          aria-label={m.calendar_next()}
          className={navBtn}
        >
          <ChevronRight className="size-5" />
        </button>
        <div className="ml-1.5 flex min-w-0 flex-col">
          <h2 className="truncate font-heading text-lg leading-tight font-black tabular-nums">
            {periodLabel}
          </h2>
          {live ? (
            <span className="inline-flex items-center gap-1.5 text-mini font-medium text-muted-foreground">
              <span className="relative flex size-2">
                <span className="animate-pulse-ring absolute inline-flex size-full rounded-full bg-brand/60" />
                <span className="relative inline-flex size-2 rounded-full bg-brand" />
              </span>
              {live}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-full bg-surface-cool p-1 md:inline-grid">
        {VIEWS.map(({ key, icon: Icon }) => {
          const active = key === view
          return (
            <button
              key={key}
              type="button"
              onClick={() => onView(key)}
              aria-pressed={active}
              className={cn(
                "inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                active
                  ? "bg-brand text-brand-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              {viewsMessages[key]()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Start ("HH:MM") of a stored "HH:MM – HH:MM" time range. */
const startOf = (time: string) => time.split(" – ")[0] ?? time

/** A visible day of the Day/Week timeline. */
interface Col {
  iso: string
  /** The date itself, or null when in the past — gates the tap-to-book gaps. */
  dayKey: string | null
  short: string
  num: number
  /** "Mon, 22 Jun" — used as the booking title and popover day label. */
  full: string
  today: boolean
  weekend: boolean
}

export function BookingsView() {
  const { bookings } = useBooking()
  const { todayIso } = useData()
  const now = useNow()

  const [view, setView] = React.useState<CalendarView>("week")
  const [cursor, setCursor] = React.useState<string>(todayIso)

  const weekdaysShort = [
    m.calendar_weekdays_short_1(),
    m.calendar_weekdays_short_2(),
    m.calendar_weekdays_short_3(),
    m.calendar_weekdays_short_4(),
    m.calendar_weekdays_short_5(),
    m.calendar_weekdays_short_6(),
    m.calendar_weekdays_short_7(),
  ] as string[]
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

  /** Build a column descriptor for a date. */
  const makeCol = React.useCallback(
    (iso: string): Col => {
      const wd = weekdaysShort[mondayIndex(iso)]
      const num = dayOfMonth(iso)
      return {
        iso,
        dayKey: isPastDay(iso, todayIso) ? null : iso,
        short: wd,
        num,
        full: `${wd}, ${num} ${monthsShort[monthOf(iso)]}`,
        today: isToday(iso, todayIso),
        weekend: isWeekend(iso),
      }
    },
    [weekdaysShort, monthsShort, todayIso]
  )

  // Every booking that resolves to a real date, bucketed by ISO day — the grid
  // (Day / Week / Month) reads from this; sorted by start time within a day.
  const eventsByDate = React.useMemo(() => {
    const map: Partial<Record<string, Booking[]>> = {}
    for (const b of bookings) {
      if (b.dayKey) (map[b.dayKey] ??= []).push(b)
    }
    for (const list of Object.values(map))
      list?.sort((a, b) => toMin(startOf(a.time)) - toMin(startOf(b.time)))
    return map
  }, [bookings])

  // History list below the grid: bookings dated before today.
  const past = React.useMemo(
    () => bookings.filter((b) => (b.dayKey ?? "") < todayIso),
    [bookings, todayIso]
  )
  const inWeekStats = React.useMemo(
    () => bookings.filter((b) => (b.dayKey ?? "") >= todayIso),
    [bookings, todayIso]
  )

  // The soonest live booking (today onward) — featured in the "Up next" card.
  const nextUp = React.useMemo(
    () =>
      bookings
        .filter(
          (b) => (b.dayKey ?? "") >= todayIso && UPCOMING.includes(b.status)
        )
        .sort(
          (a, b) =>
            (a.dayKey ?? "").localeCompare(b.dayKey ?? "") ||
            toMin(startOf(a.time)) - toMin(startOf(b.time))
        )[0] ?? null,
    [bookings, todayIso]
  )

  const stats = {
    week: inWeekStats.filter(
      (b) => UPCOMING.includes(b.status) && !isAwaitingPayment(b)
    ).length,
    confirmed: inWeekStats.filter((b) => b.status === "confirmed").length,
    pending: inWeekStats.filter(
      (b) => b.status === "pending" && !isAwaitingPayment(b)
    ).length,
    played: past.length,
  }

  // Visible columns + period heading derive from the view + cursor.
  const cols = React.useMemo<Col[]>(() => {
    if (view === "day") return [makeCol(cursor)]
    if (view === "week") return weekDays(cursor).map(makeCol)
    return []
  }, [view, cursor, makeCol])

  const periodLabel = React.useMemo(() => {
    if (view === "month") return `${months[monthOf(cursor)]} ${yearOf(cursor)}`
    if (view === "day") return makeCol(cursor).full
    const days = weekDays(cursor)
    const a = days[0]
    const b = days[6]
    const aM = monthsShort[monthOf(a)]
    const bM = monthsShort[monthOf(b)]
    return sameMonth(a, b)
      ? `${dayOfMonth(a)}–${dayOfMonth(b)} ${aM}`
      : `${dayOfMonth(a)} ${aM} – ${dayOfMonth(b)} ${bM}`
  }, [view, cursor, makeCol, months, monthsShort])

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

  // Build the timeline columns (header + placed events/gaps) for Day/Week.
  const timelineColumns = React.useMemo<TimelineColumn[]>(
    () =>
      cols.map((c) => {
        const dayEvents = eventsByDate[c.iso] ?? []
        const gaps = gapsOf(dayEvents, 0, DAY_MIN)
        return {
          key: c.iso,
          today: c.today,
          weekend: c.weekend,
          header: (
            <div className="flex items-center justify-between gap-1.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 truncate text-sm font-semibold",
                  c.today && "text-brand"
                )}
              >
                <span className="text-muted-foreground">{c.short}</span>
                <span
                  className={cn(
                    "tabular-nums",
                    c.today &&
                      "grid size-6 place-items-center rounded-full bg-brand text-brand-foreground"
                  )}
                >
                  {c.num}
                </span>
              </span>
              {dayEvents.length ? (
                <span className="rounded-full bg-secondary px-1.5 text-micro font-semibold text-secondary-foreground tabular-nums">
                  {dayEvents.length}
                </span>
              ) : null}
            </div>
          ),
          content: (
            <>
              {c.dayKey
                ? gaps.map((g) => (
                    <FreeBand
                      key={`${c.iso}-${g.start}`}
                      dayKey={c.dayKey as string}
                      dayLabel={c.full}
                      start={g.start}
                      durationMin={g.durationMin}
                      offsetMin={toMin}
                    />
                  ))
                : null}
              {dayEvents.map((b) => (
                <CalendarEvent
                  key={b.id}
                  booking={b}
                  dayLabel={c.full}
                  offsetMin={toMin}
                />
              ))}
            </>
          ),
        }
      }),
    [cols, eventsByDate]
  )

  const anyVisible = timelineColumns.some(
    (c) => (eventsByDate[c.key] ?? []).length
  )
  const monthHasEvents = monthMatrix(cursor)
    .flat()
    .some((iso) => sameMonth(iso, cursor) && iso in eventsByDate)

  return (
    // Same frame as Play / Book: full-width up to 1800px, and on desktop the
    // page fits the viewport — a left rail (next game, stats, history) beside
    // the calendar, each scrolling on its own.
    <div className="player-bookings flex min-h-full flex-col bg-surface-cool-2 text-ink-strong lg:h-full lg:overflow-hidden">
      <div className="mx-auto flex w-full max-w-450 flex-1 flex-col gap-4 px-4 py-5 sm:px-6 lg:min-h-0 lg:px-7">
        {/* Page header */}
        <header className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-8">
            <h1 className="font-heading text-2xl font-black tracking-tight sm:text-3xl">
              {m.bookings_meta_title()}
            </h1>
            <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
              {m.bookings_meta_description()}
            </p>
          </div>
          <NewBookingAction />
        </header>

        <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-sidebar-wide">
          {/* Left rail. `contents` on mobile lets its cards interleave with
              the calendar (next game → stats → calendar → history). */}
          <aside className="no-scrollbar contents lg:flex lg:min-h-0 lg:flex-col lg:gap-4 lg:overflow-y-auto">
            <NextUpCard booking={nextUp} onView={openDay} />

            <section className="order-2 shrink-0 rounded-3xl border border-line bg-white p-3 shadow-card lg:order-none">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
                <StatTile
                  label={m.bookings_summary_this_week()}
                  value={stats.week}
                />
                <StatTile
                  label={m.bookings_summary_confirmed()}
                  value={stats.confirmed}
                  brand
                />
                <StatTile
                  label={m.bookings_summary_pending()}
                  value={stats.pending}
                />
                <StatTile
                  label={m.bookings_summary_played()}
                  value={stats.played}
                />
              </div>
            </section>

            {/* Past games */}
            <section className="order-4 flex shrink-0 flex-col gap-2 rounded-3xl border border-line bg-white p-3 shadow-card lg:order-none">
              <div className="flex items-center justify-between gap-2 px-1.5 pt-1">
                <h2 className="font-heading text-base font-black">
                  {m.bookings_past_title()}
                </h2>
                {past.length ? (
                  <span className="rounded-full bg-surface-cool px-2 py-0.5 text-mini font-bold text-brand tabular-nums">
                    {past.length}
                  </span>
                ) : null}
              </div>
              {past.length ? (
                <div className="flex flex-col gap-2">
                  {past.map((b) => (
                    <PastRow key={b.id} booking={b} />
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-line-strong bg-surface-cool-2 px-4 py-8 text-center text-xs leading-relaxed text-muted-foreground">
                  {m.bookings_empty()}
                </p>
              )}
            </section>
          </aside>

          {/* The calendar */}
          <section className="order-3 flex min-w-0 flex-col gap-4 rounded-3xl border border-line bg-white p-3.5 shadow-card sm:p-5 lg:order-none lg:min-h-0 lg:overflow-y-auto">
            <BookingsToolbar
              periodLabel={periodLabel}
              view={view}
              onView={setView}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              onToday={() => setCursor(todayIso)}
              live={
                showsToday && now
                  ? m.bookings_calendar_live_at({ time: now })
                  : null
              }
            />

            {view === "month" ? (
              <MonthGrid
                cursor={cursor}
                todayIso={todayIso}
                onPickDay={openDay}
                hasContent={monthHasEvents}
                emptyLabel={m.bookings_calendar_empty_month()}
                renderDay={(iso) => (
                  <MonthDay events={eventsByDate[iso] ?? []} />
                )}
              />
            ) : (
              <Timeline
                columns={timelineColumns}
                now={now}
                single={view === "day"}
                scrollKey={`${view}:${cursor}`}
                emptyLabel={anyVisible ? null : m.bookings_calendar_empty()}
                className="ring-line lg:max-h-none lg:min-h-0 lg:flex-1"
              />
            )}

            {/* Legend (timeline views) */}
            {view !== "month" ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3">
                <LegendDot status="confirmed" />
                <LegendDot status="pending" />
                <LegendDot status="completed" />
                <LegendDot status="cancelled" />
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <span className="h-0 w-4 border-t-2 border-brand" />
                  {m.bookings_calendar_now()}
                </span>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  )
}

/** Month-cell content: up to two booking chips (sm+) / sport dots (mobile). */
function MonthDay({ events }: { events: Booking[] }) {
  const shown = events.slice(0, 2)
  const extra = events.length - shown.length
  return (
    <>
      <div className="hidden flex-col gap-1 sm:flex">
        {shown.map((b) => (
          <span
            key={b.id}
            className={cn(
              "flex items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-micro font-medium ring-1",
              bookingAccentVariants({ status: b.status }),
              b.status === "cancelled" && "line-through"
            )}
          >
            <span className="font-mono tabular-nums opacity-80">
              {startOf(b.time)}
            </span>
            <span className="truncate">{b.venue}</span>
          </span>
        ))}
        {extra > 0 ? (
          <span className="px-1 text-micro font-medium text-muted-foreground">
            {m.calendar_more({ count: extra })}
          </span>
        ) : null}
      </div>
      <div className="mt-auto flex flex-wrap gap-1 sm:hidden">
        {events.slice(0, 4).map((b) => (
          <span
            key={b.id}
            className={cn("size-1.5 rounded-full", sportAccent(b.sport))}
            aria-hidden
          />
        ))}
      </div>
    </>
  )
}

/** Free gaps (the complement of the day's events) within the visible window. */
function gapsOf(
  events: Booking[],
  windowStart: number,
  totalMin: number
): { start: string; durationMin: number }[] {
  const sorted = [...events].sort(
    (a, b) => toMin(startOf(a.time)) - toMin(startOf(b.time))
  )
  const bands: { start: string; durationMin: number }[] = []
  let cursor = 0
  for (const e of sorted) {
    const s = toMin(startOf(e.time)) - windowStart
    if (s > cursor)
      bands.push({
        start: addMinutes("00:00", windowStart + cursor),
        durationMin: s - cursor,
      })
    cursor = Math.max(cursor, s + durationOf(e.time))
  }
  if (cursor < totalMin)
    bands.push({
      start: addMinutes("00:00", windowStart + cursor),
      durationMin: totalMin - cursor,
    })
  return bands
}

/** Day words that resolve to a shared `Common.when` key (past-list labels). */
/** "HH:MM dd/mm" of a +07:00 ISO datetime (string slicing — no timezone math). */
function shortVnDateTime(iso: string): string {
  return `${iso.slice(11, 16)} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

/** A booking drawn as a Google-Calendar block, sized to its real duration. */
function CalendarEvent({
  booking,
  dayLabel,
  offsetMin,
}: {
  booking: Booking
  dayLabel: string
  offsetMin: (hhmm: string) => number
}) {
  const { cancelBooking, rebookFrom, addTeamToSession, resumePayment } =
    useBooking()
  const router = useRouter()
  const queryClient = useQueryClient()

  // Opens (or creates) the thread with the venue's owner, then shows it.
  const messageVenue = async () => {
    try {
      const { id } = await openVenueChat({
        bookingId: booking.reservationId ?? booking.id,
      })
      void router.navigate({ to: "/app/chat", search: { channel: id } })
    } catch {
      toast.error(m.chat_venue_chat_failed())
    }
  }

  const start = startOf(booking.time)
  const dur = durationOf(booking.time)
  const top = offsetMin(start) * PX_PER_MIN
  const height = Math.max(20, dur * PX_PER_MIN - 2)
  const compact = height < 46
  const cancelled = booking.status === "cancelled"
  const closed = booking.status === "completed" || cancelled
  const hasTeam = Boolean(booking.roomId)
  const solo = booking.withPlayers.length <= 1
  const going = booking.withPlayers.filter((p) => p.status !== "pending").length
  const invited = booking.withPlayers.filter(
    (p) => p.status === "pending"
  ).length
  const courtNo = booking.court.match(/^Court (\d+)$/)?.[1]
  const courtLabel = courtNo
    ? m.bookings_court_label({ n: courtNo })
    : booking.court
  // Where the booking is in the bank-transfer flow (plan 025). A booking made
  // before it existed has no `bookingStatus` and keeps the old behaviour.
  const bs = booking.bookingStatus
  const unpaid =
    bs === "awaiting_payment" ||
    (bs === undefined && isAwaitingPayment(booking))
  const waitingVenue = bs === "awaiting_venue_confirmation"
  const refundPending = bs === "rejected_refund_pending"
  const refunded = bs === "refunded"
  const refundAmount = booking.refund?.amount ?? 0
  const bookingKey = booking.reservationId ?? booking.id
  const [answering, startAnswering] = React.useTransition()
  const answerRefund = (result: "received" | "not_received") => {
    startAnswering(async () => {
      const res = await confirmRefundReceipt(bookingKey, result)
      if (!res.ok) {
        toast.error(res.message)
        return
      }
      toast.success(
        result === "received"
          ? m.bookings_refund_received_thanks()
          : m.bookings_refund_complaint_sent()
      )
      void queryClient.invalidateQueries({ queryKey: queryKeys.seed() })
    })
  }

  return (
    <div className="absolute inset-x-1 z-10" style={{ top: top + 1, height }}>
      <PopoverTrigger>
        <Button
          variant="ghost"
          className={cn(
            "h-full w-full flex-col items-stretch justify-start gap-0.5 overflow-hidden rounded-lg px-2 py-1 text-left font-normal whitespace-normal ring-1 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
            bookingAccentVariants({ status: booking.status }),
            cancelled && "line-through"
          )}
        >
          <span className="flex items-center gap-1">
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                sportAccent(booking.sport)
              )}
              aria-hidden
            />
            <span className="truncate text-mini leading-tight font-semibold">
              {booking.venue}
            </span>
          </span>
          {!compact ? (
            <>
              <span className="font-mono text-micro leading-none tabular-nums opacity-80">
                {start} – {addMinutes(start, dur)}
              </span>
              <span className="inline-flex items-center gap-1 text-micro leading-none opacity-80">
                <Users className="size-2.5" />
                {courtLabel}
              </span>
              {booking.groupSession ? (
                <span className="text-nano font-semibold tracking-wide uppercase opacity-75">
                  {m.bookings_group_session()}
                </span>
              ) : null}
            </>
          ) : null}
        </Button>
        <Popover
          placement="bottom start"
          className="player-bookings-overlay w-72 gap-0 p-3"
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {booking.venue}
                </p>
                <p className="text-xs text-muted-foreground">
                  {courtLabel} · {sportsMessages[booking.sport]()}
                </p>
              </div>
              <StatusBadge
                status={booking.status}
                paymentStatus={booking.paymentStatus}
                bookingStatus={booking.bookingStatus}
              />
            </div>

            {booking.groupSession ? (
              <div className="flex w-fit items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand">
                <Users className="size-3.5" />
                {m.bookings_group_session()}
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <SportTag sport={booking.sport} />
            </div>

            <div className="flex flex-col gap-1.5 rounded-2xl bg-muted/50 px-3 py-2">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3.5" />
                <span className="font-mono tabular-nums">
                  {dayLabel} · {start} – {addMinutes(start, dur)}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="size-3.5" />
                {booking.venue}
              </span>
            </div>

            {unpaid ? (
              <p className="rounded-2xl bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
                {m.bookings_unpaid_note()}
              </p>
            ) : waitingVenue ? (
              <p className="rounded-2xl bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
                {booking.confirmDeadlineAt
                  ? m.bookings_waiting_venue_note({
                      deadline: shortVnDateTime(booking.confirmDeadlineAt),
                    })
                  : m.bookings_waiting_venue_note_no_time()}
              </p>
            ) : booking.status === "pending" ? (
              <p className="rounded-2xl bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
                {m.bookings_pending_note()}
              </p>
            ) : null}

            {refundPending ? (
              <div className="flex flex-col gap-1 rounded-2xl bg-destructive/8 px-3 py-2 text-xs text-destructive/80">
                <span>
                  {m.bookings_refund_pending_note({
                    reason: booking.declineReason ?? "",
                    amount: formatVndFull(refundAmount),
                  })}
                </span>
              </div>
            ) : null}

            {refunded ? (
              <div className="flex flex-col gap-2 rounded-2xl bg-muted/60 px-3 py-2 text-xs">
                <span>
                  {m.bookings_refunded_note2({
                    amount: formatVndFull(refundAmount),
                  })}
                </span>
                {booking.refund?.proofUrl ? (
                  <a
                    href={booking.refund.proofUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-brand underline"
                  >
                    {m.bookings_view_refund_proof()}
                  </a>
                ) : null}
                {booking.refundConfirmation === "received" ? (
                  <span className="text-muted-foreground">
                    {m.bookings_refund_confirmed_received()}
                  </span>
                ) : booking.refundConfirmation === "not_received" ? (
                  <span className="text-destructive">
                    {m.bookings_refund_confirmed_not_received()}
                  </span>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      shape="pill"
                      size="sm"

                      isDisabled={answering}
                      onPress={() => answerRefund("received")}
                    >
                      {m.bookings_refund_received()}
                    </Button>
                    <Button
                      shape="pill"
                      size="sm"
                      variant="outline"

                      isDisabled={answering}
                      onPress={() => answerRefund("not_received")}
                    >
                      {m.bookings_refund_not_received()}
                    </Button>
                  </div>
                )}
              </div>
            ) : null}

            {cancelled &&
            !refundPending &&
            !refunded &&
            booking.declineReason ? (
              <div className="flex flex-col gap-1 rounded-2xl bg-destructive/8 px-3 py-2 text-xs text-destructive/80">
                <span>
                  {m.bookings_declined_note({ reason: booking.declineReason })}
                </span>
              </div>
            ) : null}

            {booking.withPlayers.length ? (
              <div className="flex items-center justify-between gap-2">
                <AvatarGroup>
                  {booking.withPlayers.map((p) => (
                    <Avatar key={p.initials}>
                      <AvatarFallback
                        tone="secondary"
                        size="xs"
                        weight="medium"
                      >
                        {p.initials}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </AvatarGroup>
                {invited > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {m.bookings_going_invited({ going, invited })}
                  </span>
                ) : null}
              </div>
            ) : null}

            {booking.status === "completed" && booking.result ? (
              <div className="flex items-center gap-2">
                <Badge
                  className={cn(
                    booking.result === "W"
                      ? "bg-brand/12 text-brand"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <Trophy className="size-3" />
                  {booking.result === "W"
                    ? m.common_result_win()
                    : m.common_result_loss()}
                </Badge>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {booking.score}
                </span>
              </div>
            ) : null}

            {/* Actions */}
            {closed ? (
              <div className="flex flex-col gap-1.5">
                {booking.venueId && !cancelled ? (
                  <Button
                    shape="pill"
                    size="sm"
                    variant="outline"
                    className="w-full justify-start"
                    onPress={() => void messageVenue()}
                  >
                    <MessageSquare />
                    {m.bookings_message_venue()}
                  </Button>
                ) : null}
                {!booking.groupSession ? (
                  <Button
                    shape="pill"
                    size="sm"
                    variant="outline"
                    className="w-full justify-start"
                    onPress={() => rebookFrom(booking.id)}
                  >
                    <RotateCcw />
                    {m.bookings_rebook()}
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {unpaid ? (
                  <Button
                    shape="pill"
                    size="sm"
                    className="w-full justify-start"
                    onPress={() => resumePayment(bookingKey)}
                  >
                    <CreditCard />
                    {m.bookings_continue_payment()}
                  </Button>
                ) : null}
                {booking.venueId ? (
                  <Button
                    shape="pill"
                    size="sm"
                    variant="outline"
                    className="w-full justify-start"
                    onPress={() => void messageVenue()}
                  >
                    <MessageSquare />
                    {m.bookings_message_venue()}
                  </Button>
                ) : null}
                {solo && !booking.groupSession ? (
                  <Button
                    shape="pill"
                    size="sm"
                    variant="outline"
                    className="w-full justify-start"
                    onPress={() => addTeamToSession(booking.id)}
                  >
                    <UserPlus />
                    {m.bookings_add_team()}
                  </Button>
                ) : null}
                {!booking.groupSession && (unpaid || !booking.reservationId) ? (
                  <AlertDialogTrigger>
                    <Button
                      shape="pill"
                      size="sm"
                      variant="ghost"
                      className="w-full justify-start text-destructive"
                    >
                      {m.bookings_cancel()}
                    </Button>
                    <AlertDialogContent className="player-bookings-overlay">
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {m.bookings_cancel_title()}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {hasTeam
                            ? m.bookings_cancel_team_body()
                            : m.bookings_cancel_solo_body()}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>
                          {m.bookings_keep()}
                        </AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onPress={() => cancelBooking(booking.id)}
                        >
                          {m.bookings_cancel_confirm()}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialogTrigger>
                ) : (
                  <p className="px-1 text-xs text-muted-foreground">
                    {m.bookings_cancel_via_chat()}
                  </p>
                )}
              </div>
            )}
          </div>
        </Popover>
      </PopoverTrigger>
    </div>
  )
}

/** A free gap — subtle until hovered, click to start a booking on that day. */
function FreeBand({
  dayKey,
  dayLabel,
  start,
  durationMin,
  offsetMin,
}: {
  dayKey: string
  dayLabel: string
  start: string
  durationMin: number
  offsetMin: (hhmm: string) => number
}) {
  const { openBooking, setDay, setSlot } = useBooking()
  const top = offsetMin(start) * PX_PER_MIN
  const height = durationMin * PX_PER_MIN
  if (height < 24) return null

  const startBooking = () => {
    openBooking(null)
    setDay(dayKey)
    setSlot(start)
  }

  return (
    <button
      type="button"
      onClick={startBooking}
      title={m.bookings_calendar_book_day({ day: dayLabel })}
      className="group/free absolute inset-x-1 z-0 flex items-center justify-center rounded-lg text-electric-deep/0 transition-colors hover:bg-volt/25 hover:text-electric-deep focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      style={{ top, height }}
    >
      <Plus className="size-3.5" />
    </button>
  )
}

/** Compact legend entry mapping a status to its calendar tint. */
function LegendDot({ status }: { status: BookingStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={cn(
          "size-3 rounded-md ring-1",
          bookingAccentVariants({ status })
        )}
      />
      {statusMessages[status]()}
    </span>
  )
}

/**
 * One past game in the left rail's history list: date tile, venue, court and
 * time, the result/score (or final status), the players and a rebook action.
 */
function PastRow({ booking }: { booking: Booking }) {
  const { rebookFrom } = useBooking()
  const { dayLabelFor } = useData()
  const locale = getLocale()
  const courtLabel = useCourtLabel()
  const done = booking.status === "completed"

  const dayLabel = booking.dayKey
    ? locStr(dayLabelFor(booking.dayKey), locale)
    : dayWordLabel(booking.day)

  return (
    // Two stacked bands so nothing has to share one tight line in the 320px
    // rail: identity (date · venue · court · time) above, and a wrapping meta
    // strip (sport · result/status · players) + rebook below.
    <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-white p-2.5 transition-colors hover:border-line-blue hover:bg-surface-cool-2">
      <div className="flex items-start gap-3">
        <DateTile iso={booking.dayKey} size="sm" />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="line-clamp-2 text-sm leading-snug font-bold">
            {booking.venue}
          </p>
          <p className="mt-1 flex min-w-0 items-center gap-1 text-mini text-muted-foreground">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{courtLabel(booking.court)}</span>
          </p>
          <p className="mt-0.5 flex min-w-0 items-center gap-1 text-mini text-muted-foreground">
            <Clock className="size-3 shrink-0" />
            <span className="truncate tabular-nums">
              {dayLabel} · {booking.time}
            </span>
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-dashed border-line-strong pt-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
          <SportTag sport={booking.sport} />
          {done && booking.result ? (
            <>
              <Badge
                className={cn(
                  booking.result === "W"
                    ? "bg-volt text-electric-deep"
                    : "bg-surface-gray text-ink-muted"
                )}
              >
                <Trophy className="size-3" />
                {booking.result === "W"
                  ? m.common_result_win()
                  : m.common_result_loss()}
              </Badge>
              <span className="font-mono text-mini text-muted-foreground tabular-nums">
                {booking.score}
              </span>
            </>
          ) : (
            <StatusBadge
              status={booking.status}
              paymentStatus={booking.paymentStatus}
              bookingStatus={booking.bookingStatus}
            />
          )}
          {booking.withPlayers.length ? (
            <AvatarGroup>
              {booking.withPlayers.slice(0, 3).map((p) => (
                <Avatar key={p.initials} size="sm">
                  <AvatarFallback tone="soft" size="micro" weight="semibold">
                    {p.initials}
                  </AvatarFallback>
                </Avatar>
              ))}
            </AvatarGroup>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => rebookFrom(booking.id)}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border-2 border-lime px-3 text-mini font-bold text-brand transition-colors hover:bg-lime/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <RotateCcw className="size-3.5" />
          {m.bookings_rebook()}
        </button>
      </div>
    </div>
  )
}

function StatusBadge({
  status,
  paymentStatus,
  bookingStatus,
}: {
  status: BookingStatus
  paymentStatus?: Booking["paymentStatus"]
  bookingStatus?: Booking["bookingStatus"]
}) {
  if (bookingStatus === "awaiting_venue_confirmation")
    return <Badge variant="warn">{m.bookings_waiting_venue_badge()}</Badge>
  if (bookingStatus === "rejected_refund_pending")
    return <Badge variant="danger">{m.bookings_refund_pending_badge()}</Badge>
  if (bookingStatus === "refunded")
    return <Badge variant="neutral">{m.bookings_refunded_badge()}</Badge>
  if (paymentStatus === "awaiting")
    return <Badge variant="warn">{m.bookings_unpaid()}</Badge>
  const label = statusMessages[status]()
  if (status === "confirmed") return <Badge variant="brand">{label}</Badge>
  if (status === "pending") return <Badge variant="warn">{label}</Badge>
  if (status === "cancelled") return <Badge variant="danger">{label}</Badge>
  return <Badge variant="neutral">{label}</Badge>
}
