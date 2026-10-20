import * as React from "react"
import {
  Loader2,
  Locate,
  LocateFixed,
  MapPin,
  Navigation,
  Star,
} from "lucide-react"

import { compareDistance, hasCoordinates } from "@/lib/shared/location"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatVnd } from "@/lib/shared"
import type { Court } from "@/lib/shared"
import { useData } from "@/features/dashboard/components/data-provider"
import { useBooking } from "@/features/booking/components/booking"
import { CourtImage, SportTag } from "@/features/dashboard/components/shared"
import { CourtPhotosButton } from "@/features/dashboard/components/court-photos"
import { CourtMap } from "@/features/play/components/court-map"
import { m } from "@/paraglide/messages"

const geoMessages = {
  locating: m.find_courts_geo_locating,
  on: m.find_courts_geo_on,
  off: m.find_courts_geo_off,
} as const

const sortMessages = {
  distance: m.find_courts_sort_distance,
  price: m.find_courts_sort_price,
  rating: m.find_courts_sort_rating,
} as const

type SortKey = "distance" | "price" | "rating"

const SORTS: SortKey[] = ["distance", "price", "rating"]
const TOTAL_DAILY_SLOTS = 8

/** A court paired with its distance to the player, if location is available. */
type CourtItem = { court: Court; distanceKm: number | null }

const COMPARE: Record<SortKey, (a: CourtItem, b: CourtItem) => number> = {
  distance: compareDistance,
  price: (a, b) => a.court.pricePerHour - b.court.pricePerHour,
  rating: (a, b) => b.court.rating - a.court.rating,
}

// ── Attribute filters (driven by the court records) ─────────────────────────

export type PriceFilter = "all" | "lt150" | "150to250" | "250to350" | "gte350"
export type RatingFilter = "all" | "3" | "4" | "4.5"
export type DistanceFilter = "all" | "2" | "5" | "10"

export interface CourtFilterState {
  /** Exact `court.surface` value, or "all". */
  surface: string
  price: PriceFilter
  rating: RatingFilter
  distance: DistanceFilter
}

export const DEFAULT_COURT_FILTERS: CourtFilterState = {
  surface: "all",
  price: "all",
  rating: "all",
  distance: "all",
}

/** Half-open [min, max) VND buckets. */
const PRICE_RANGE: Record<PriceFilter, readonly [number, number] | null> = {
  all: null,
  lt150: [0, 150_000],
  "150to250": [150_000, 250_000],
  "250to350": [250_000, 350_000],
  gte350: [350_000, Number.POSITIVE_INFINITY],
}

const RATING_MIN: Record<RatingFilter, number> = {
  all: 0,
  "3": 3,
  "4": 4,
  "4.5": 4.5,
}

const DISTANCE_MAX: Record<DistanceFilter, number | null> = {
  all: null,
  "2": 2,
  "5": 5,
  "10": 10,
}

/** Whether a court satisfies every active attribute filter. */
function matchesFilters(court: Court, f: CourtFilterState): boolean {
  if (f.surface !== "all" && court.surface !== f.surface) return false

  const range = PRICE_RANGE[f.price]
  if (
    range &&
    !(court.pricePerHour >= range[0] && court.pricePerHour < range[1])
  )
    return false

  if (court.rating < RATING_MIN[f.rating]) return false

  const maxKm = DISTANCE_MAX[f.distance]
  // An unknown distance can't be proven within the radius, so it's dropped
  // while a distance filter is active.
  if (maxKm != null && (court.distanceKm == null || court.distanceKm > maxKm))
    return false

  return true
}

function activeFilterCount(f: CourtFilterState): number {
  return [
    f.surface !== "all",
    f.price !== "all",
    f.rating !== "all",
    f.distance !== "all",
  ].filter(Boolean).length
}

/** Lower-case and strip diacritics so search ignores case and accents. */
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()

function courtAddress(court: Pick<Court, "ward" | "province">) {
  return [court.ward, court.province].filter(Boolean).join(", ")
}

/** Open Google Maps driving directions to a court in a new tab. */
function openDirections(court: Court) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${court.lat},${court.lng}`
  window.open(url, "_blank", "noopener,noreferrer")
}

export function FindCourtsView({
  query,
  filters,
}: {
  query: string
  filters: CourtFilterState
}) {
  const {
    courts: COURTS,
    venuePins,
    userLoc,
    geoStatus,
    requestLocation,
  } = useData()
  const [sort, setSort] = React.useState<SortKey>("distance")
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const locate = () => void requestLocation()

  // Filter by court attributes and address/name, then sort by the shared live
  // distances.
  const items = React.useMemo(() => {
    const q = normalize(query)
    return COURTS.filter((c) => matchesFilters(c, filters))
      .filter(
        (c) =>
          !q ||
          normalize(c.name).includes(q) ||
          normalize(courtAddress(c)).includes(q)
      )
      .map((court) => ({
        court,
        distanceKm: court.distanceKm,
      }))
      .sort(COMPARE[sort])
  }, [COURTS, sort, query, filters])

  const mapCourts = React.useMemo(
    () => items.map((i) => i.court).filter(hasCoordinates),
    [items]
  )
  const mapVenues = React.useMemo(
    () => venuePins.filter(hasCoordinates),
    [venuePins]
  )

  // Derive the live selection rather than syncing state in an effect — a court
  // dropped by the filters simply stops being selected.
  const selectedId_ = items.some((i) => i.court.id === selectedId)
    ? selectedId
    : null

  return (
    <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-main-aside">
      <div className="relative h-80 overflow-hidden rounded-2xl bg-secondary ring-1 ring-line-strong lg:h-full">
        <CourtMap
          blueMarkers
          courts={mapCourts}
          venues={mapVenues}
          selectedId={selectedId_}
          onSelect={setSelectedId}
          userLoc={userLoc}
        />
        <button
          type="button"
          onClick={locate}
          disabled={geoStatus === "locating"}
          className="absolute right-3 bottom-3 z-10 inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/95 px-3 py-2 text-xs font-semibold text-ink shadow-md ring-1 ring-black/5 backdrop-blur transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-80"
        >
          {geoStatus === "locating" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : geoStatus === "on" ? (
            <LocateFixed className="size-3.5 text-brand" />
          ) : (
            <Locate className="size-3.5" />
          )}
          {geoMessages[geoStatus]()}
        </button>
      </div>

      <div className="flex min-w-0 flex-col gap-2 lg:h-full lg:min-h-0">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <span className="text-xs font-semibold text-muted-foreground">
            {m.find_courts_nearby({ count: items.length })}
          </span>
          <Select
            value={sort}
            onChange={(value) => {
              const next = SORTS.find((key) => key === value)
              if (next) setSort(next)
            }}
          >
            <SelectTrigger
              surface="field"
              aria-label={m.find_courts_sort_by()}
              className="h-9"
            >
              <SelectValue>{sortMessages[sort]()}</SelectValue>
            </SelectTrigger>
            <SelectContent className="player-play-overlay rounded-xl">
              {SORTS.map((key) => (
                <SelectItem key={key} id={key}>
                  {sortMessages[key]()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Bleed the scroll area into the gutter so overflow clipping doesn't
            cut each card's ring/shadow on the left and right edges. */}
        <div className="no-scrollbar flex flex-col gap-2.5 p-1 lg:-mx-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {items.map((item) => (
            <CourtCard
              key={item.court.id}
              court={item.court}
              distanceKm={item.distanceKm}
              active={item.court.id === selectedId_}
              onSelect={() => setSelectedId(item.court.id)}
            />
          ))}
          {!items.length ? (
            <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-16 text-center text-sm text-muted-foreground">
              {m.find_courts_empty()}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function CourtCard({
  court,
  distanceKm,
  active,
  onSelect,
}: {
  court: Court
  distanceKm: number | null
  active: boolean
  onSelect: () => void
}) {
  const { openBooking } = useBooking()
  const ref = React.useRef<HTMLDivElement>(null)

  // Reveal the card when it becomes the selection (e.g. via a map marker).
  React.useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" })
  }, [active])

  return (
    <div
      ref={ref}
      className={cn(
        "relative shrink-0 rounded-2xl border bg-card p-3 shadow-card transition-shadow hover:shadow-md",
        active ? "border-brand ring-2 ring-brand" : "border-line"
      )}
    >
      {/* Stretched click target — selecting the card flies the map to it.
          The action buttons below opt back into pointer events and sit above. */}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        aria-label={court.name}
        className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />

      <div className="pointer-events-none relative z-10 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <CourtImage court={court} className="size-19 rounded-xl" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 font-heading text-sm leading-snug font-bold">
                {court.name}
              </p>
              <span className="inline-flex shrink-0 items-center gap-1 text-micro font-semibold tabular-nums">
                <Star className="size-3 fill-amber-400 text-amber-400" />
                {court.rating}
              </span>
            </div>
            <p className="mt-1 flex items-start gap-1 text-mini leading-snug text-muted-foreground">
              <MapPin className="mt-0.5 size-3 shrink-0" />
              {courtAddress(court)}
            </p>
            <p className="mt-1 text-mini text-muted-foreground">
              {distanceKm != null
                ? m.find_courts_distance({ km: distanceKm })
                : m.find_courts_distance_unknown()}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 [&_[data-slot=badge]]:text-micro">
              {court.sports.map((s) => (
                <SportTag key={s} sport={s} />
              ))}
              <span className="text-micro text-muted-foreground">
                · {court.surface}
              </span>
            </div>
            <CourtPhotosButton court={court} className="mt-1.5" />
            <div className="mt-1.5 inline-flex w-fit items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-micro font-medium text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">
                {court.openSlots}
              </span>
              <span>free</span>
              <span className="text-muted-foreground/60">/</span>
              <span className="font-semibold text-foreground tabular-nums">
                {TOTAL_DAILY_SLOTS}
              </span>
              <span>slots</span>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-heading text-base leading-none font-bold tabular-nums">
              {formatVnd(court.pricePerHour)}
            </span>
            <span className="text-micro text-muted-foreground">
              {m.find_courts_per_hour()}
            </span>
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            <Button
              variant="lime"
              shape="pill"
              size="sm"
              className="h-9 px-5 text-xs font-semibold"
              onPress={() => openBooking(court.id)}
            >
              {m.find_courts_book()}
            </Button>
            <Button
              shape="pill"
              size="sm"
              variant="outline"
              className="h-9 border-line-strong px-3 text-xs"
              onPress={() => openDirections(court)}
              isDisabled={!hasCoordinates(court)}
            >
              <Navigation className="size-3.5" />
              <span>{m.find_courts_directions()}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Attribute filters for the court list, rendered in the Play sidebar. Options
 * come from the loaded court records (distinct surfaces) plus fixed price /
 * rating / distance buckets.
 */
export function CourtFilterPanel({
  value,
  onChange,
}: {
  value: CourtFilterState
  onChange: (value: CourtFilterState) => void
}) {
  const { courts } = useData()

  const surfaces = React.useMemo(
    () =>
      Array.from(new Set(courts.map((c) => c.surface).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b, "vi")
      ),
    [courts]
  )

  const active = activeFilterCount(value)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-mini tracking-wider text-muted-foreground uppercase">
          {m.find_courts_filters_title()}
        </h3>
        {active ? (
          <button
            type="button"
            onClick={() => onChange(DEFAULT_COURT_FILTERS)}
            className="text-mini font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            {m.find_courts_filters_clear()}
          </button>
        ) : null}
      </div>

      <FilterSelect
        label={m.find_courts_filters_surface()}
        value={value.surface}
        onChange={(v) => onChange({ ...value, surface: v })}
        options={[
          { value: "all", label: m.find_courts_filters_all() },
          ...surfaces.map((surface) => ({ value: surface, label: surface })),
        ]}
      />
      <FilterSelect
        label={m.find_courts_filters_price()}
        value={value.price}
        onChange={(v) => onChange({ ...value, price: v as PriceFilter })}
        options={[
          { value: "all", label: m.find_courts_filters_all() },
          { value: "lt150", label: m.find_courts_filters_price_lt150() },
          { value: "150to250", label: m.find_courts_filters_price150to250() },
          { value: "250to350", label: m.find_courts_filters_price250to350() },
          { value: "gte350", label: m.find_courts_filters_price_gte350() },
        ]}
      />
      <FilterSelect
        label={m.find_courts_filters_rating()}
        value={value.rating}
        onChange={(v) => onChange({ ...value, rating: v as RatingFilter })}
        options={[
          { value: "all", label: m.find_courts_filters_all() },
          { value: "3", label: m.find_courts_filters_rating3() },
          { value: "4", label: m.find_courts_filters_rating4() },
          { value: "4.5", label: m.find_courts_filters_rating45() },
        ]}
      />
      <FilterSelect
        label={m.find_courts_filters_distance()}
        value={value.distance}
        onChange={(v) => onChange({ ...value, distance: v as DistanceFilter })}
        options={[
          { value: "all", label: m.find_courts_filters_all() },
          { value: "2", label: m.find_courts_filters_distance2() },
          { value: "5", label: m.find_courts_filters_distance5() },
          { value: "10", label: m.find_courts_filters_distance10() },
        ]}
      />
    </div>
  )
}

/** A labeled, full-width single-select used inside the filter panel. */
function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  const current = options.find((o) => o.value === value)?.label ?? ""
  return (
    <label className="flex flex-col gap-1">
      <span className="text-mini font-medium text-muted-foreground">
        {label}
      </span>
      <Select
        value={value}
        onChange={(next) => {
          if (typeof next === "string") onChange(next)
        }}
      >
        <SelectTrigger
          surface="field"
          aria-label={label}
          className="h-10 w-full"
        >
          <SelectValue>{current}</SelectValue>
        </SelectTrigger>
        <SelectContent className="player-play-overlay rounded-xl">
          {options.map((o) => (
            <SelectItem key={o.value} id={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}
