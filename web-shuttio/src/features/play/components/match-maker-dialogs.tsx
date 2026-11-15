import { useLocation } from "@tanstack/react-router"
import * as React from "react"
import { useForm, useStore } from "@tanstack/react-form"
import { getLocale } from "@/paraglide/runtime"
import { toast } from "sonner"
import * as z from "zod"
import {
  Check,
  LocateFixed,
  Minus,
  Plus,
  Search,
  TriangleAlert,
  Zap,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  LEVELS,
  SELF_CHECKIN_RADIUS_M,
  SELF_COST_MAX,
  diffMinutes,
  locStr,
} from "@/lib/shared"
import type { CourtMode, RoomLevel, SelfCourt } from "@/lib/shared"
import { currentPosition } from "@/features/play/lib/geolocation"
import { PlaceSuggestField } from "@/features/play/components/self-court-place-field"
import type { PlaceHit } from "@/features/play/lib/place-search"
import type { GeoFailure } from "@/features/play/lib/geolocation"
import { useData } from "@/features/dashboard/components/data-provider"
import { useSessionData } from "@/features/play/hooks/use-session-data"
import { useSessionActions } from "@/features/play/hooks/use-session-actions"
import { useSessionUi } from "@/features/play/state/session-ui"
import type { QuickJoinFilters } from "@/features/play/lib/session-types"
import { m } from "@/paraglide/messages"

const levelsMessages = {
  beginner: m.common_levels_beginner,
  intermediate: m.common_levels_intermediate,
  advanced: m.common_levels_advanced,
} as const

/** One row of single-select segmented chips built from Button. */
function FilterChips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-mini tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <Button
            shape="pill"
            key={o.value}
            type="button"
            size="sm"
            variant={o.value === value ? "default" : "outline"}

            onPress={() => onChange(o.value)}
          >
            {o.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

/** The slice of a TanStack Form field a plain text input needs. */
interface TextFieldApi {
  name: string
  state: {
    value: string
    meta: {
      isTouched: boolean
      isValid: boolean
      errors: Array<{ message?: string } | undefined>
    }
  }
  handleBlur: () => void
  handleChange: (value: string) => void
}

function TextField({
  field,
  label,
  placeholder,
  description,
  inputMode,
}: {
  field: TextFieldApi
  label: string
  placeholder?: string
  description?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
}) {
  const invalid = field.state.meta.isTouched && !field.state.meta.isValid
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Input
        id={field.name}
        name={field.name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        aria-invalid={invalid}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete="off"
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {invalid && <FieldError errors={field.state.meta.errors} />}
    </Field>
  )
}

/** Where place search is biased before anything is pinned. */
const HCMC_CENTER = { lat: 10.7769, lng: 106.7009 }

// Mapbox ships only once a host actually pins a self-booked court.
const SelfCourtLocationPicker = React.lazy(
  () => import("@/features/play/components/self-court-location-picker")
)

const geoMessages: Record<GeoFailure, () => string> = {
  denied: m.self_court_geo_denied,
  unavailable: m.self_court_geo_unavailable,
  unsupported: m.self_court_geo_unsupported,
}

/** Pin a self-booked court: from the host's own position, or on the map. */
function SelfCourtPinField({
  value,
  onChange,
}: {
  value: { lat: number; lng: number } | null
  onChange: (next: { lat: number; lng: number }) => void
}) {
  const [locating, setLocating] = React.useState(false)
  const pinMyLocation = () => {
    setLocating(true)
    currentPosition()
      .then((fix) => onChange({ lat: fix.lat, lng: fix.lng }))
      .catch((reason: GeoFailure) => toast.error(geoMessages[reason]()))
      .finally(() => setLocating(false))
  }
  return (
    <div className="flex flex-col gap-2">
      <React.Suspense fallback={null}>
        <SelfCourtLocationPicker value={value} onChange={onChange} />
      </React.Suspense>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          shape="pill"
          type="button"
          size="sm"
          variant="outline"
          isDisabled={locating}
          onPress={pinMyLocation}
        >
          <LocateFixed />
          {locating ? m.self_court_pin_locating() : m.self_court_pin_use_mine()}
        </Button>
        {value ? (
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {m.self_court_pin_set({
              lat: value.lat.toFixed(5),
              lng: value.lng.toFixed(5),
            })}
          </span>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Quick Join filter dialog. Its open-state lives in the session store so the
 * topbar action and the Match Maker empty-state can both summon it; the filter
 * choices stay local to the dialog and reset only the court search on close.
 */
function QuickJoinDialog() {
  const { courts: COURTS } = useData()
  const pathname = useLocation({ select: (l) => l.pathname })
  const playScope = pathname === "/app/play"
  const { quickJoinOpen, setQuickJoinOpen } = useSessionUi()
  const { quickJoin } = useSessionActions()
  const [maxDistance, setMaxDistance] = React.useState("any") // "2" | "5" | "any"
  const [day, setDay] =
    React.useState<QuickJoinFilters["day"]>("today-tomorrow")
  const [format, setFormat] = React.useState<QuickJoinFilters["format"]>("any")
  const [level, setLevel] = React.useState<QuickJoinFilters["level"]>("my")
  const [quickCourt, setQuickCourt] = React.useState<string>("any")
  const [courtQuery, setCourtQuery] = React.useState("")

  // Courts offered in Quick Join, filtered by the search query (court name or
  // full address).
  const courtNeedle = courtQuery.trim().toLowerCase()
  const filteredCourts = courtNeedle
    ? COURTS.filter(
        (c) =>
          c.name.toLowerCase().includes(courtNeedle) ||
          c.ward.toLowerCase().includes(courtNeedle) ||
          c.province.toLowerCase().includes(courtNeedle)
      )
    : COURTS

  const buildFilters = (): QuickJoinFilters => ({
    // The app is badminton-only — no sport choice to offer.
    sport: "badminton",
    courtId: quickCourt === "any" ? null : quickCourt,
    maxDistanceKm: maxDistance === "any" ? null : Number(maxDistance),
    day,
    format,
    level,
  })

  const runQuickJoin = () => {
    quickJoin(buildFilters())
    setQuickJoinOpen(false)
  }

  return (
    <Dialog
      isOpen={quickJoinOpen}
      onOpenChange={(o) => {
        if (!o) setCourtQuery("")
        setQuickJoinOpen(o)
      }}
      className={cn(
        "max-h-vh-88 overflow-y-auto sm:max-w-md",
        playScope && "player-play-overlay"
      )}
    >
      <DialogHeader>
        <DialogTitle>{m.match_maker_quick_join()}</DialogTitle>
        <DialogDescription>
          {m.match_maker_quick_filter_description()}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-mini tracking-wider text-muted-foreground uppercase">
            {m.match_maker_quick_filter_court()}
          </span>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={courtQuery}
              onChange={(e) => setCourtQuery(e.target.value)}
              placeholder={m.match_maker_quick_filter_court_search()}
              aria-label={m.match_maker_quick_filter_court_search()}
              className="h-9 pl-8"
            />
          </div>
          <div className="flex max-h-44 flex-col gap-0.5 overflow-y-auto rounded-2xl border border-border p-1">
            <button
              type="button"
              onClick={() => setQuickCourt("any")}
              className={cn(
                "flex w-full items-center rounded-xl px-2.5 py-1.5 text-left text-sm transition-colors",
                quickCourt === "any"
                  ? "bg-secondary font-medium"
                  : "hover:bg-muted/60"
              )}
            >
              {m.match_maker_quick_filter_any_court()}
            </button>
            {filteredCourts.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setQuickCourt(c.id)}
                className={cn(
                  "flex w-full items-center gap-1 rounded-xl px-2.5 py-1.5 text-left text-sm transition-colors",
                  quickCourt === c.id
                    ? "bg-secondary font-medium"
                    : "hover:bg-muted/60"
                )}
              >
                <span className="truncate">{c.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  · {[c.ward, c.province].filter(Boolean).join(", ")}
                </span>
              </button>
            ))}
            {filteredCourts.length === 0 ? (
              <p className="px-2.5 py-2 text-xs text-muted-foreground">
                {m.match_maker_quick_filter_no_courts()}
              </p>
            ) : null}
          </div>
        </div>
        <FilterChips
          label={m.match_maker_quick_filter_distance()}
          value={maxDistance}
          onChange={setMaxDistance}
          options={[
            { value: "2", label: m.match_maker_quick_filter_distance2() },
            { value: "5", label: m.match_maker_quick_filter_distance5() },
            { value: "any", label: m.match_maker_quick_filter_any() },
          ]}
        />
        <FilterChips
          label={m.match_maker_quick_filter_when()}
          value={day}
          onChange={setDay}
          options={[
            { value: "today", label: m.match_maker_quick_filter_day_today() },
            {
              value: "today-tomorrow",
              label: m.match_maker_quick_filter_day_today_tomorrow(),
            },
          ]}
        />
        <FilterChips
          label={m.match_maker_quick_filter_format()}
          value={format}
          onChange={setFormat}
          options={[
            { value: "any", label: m.match_maker_quick_filter_any() },
            { value: "Singles", label: m.common_format_singles() },
            { value: "Doubles", label: m.common_format_doubles() },
          ]}
        />
        <FilterChips
          label={m.match_maker_quick_filter_level()}
          value={level}
          onChange={setLevel}
          options={[
            { value: "my", label: m.match_maker_quick_filter_my_level() },
            { value: "any", label: m.match_maker_quick_filter_any() },
            ...LEVELS.map((l) => ({
              value: l.value,
              label: levelsMessages[l.value](),
            })),
          ]}
        />
      </div>
      <DialogFooter>
        <Button shape="pill" onPress={runQuickJoin}>
          <Zap />
          {m.match_maker_quick_filter_find()}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

/**
 * Host-a-room dialog. Like Quick Join, its open-state is owned by the store so
 * the topbar can trigger it; the form state stays local and resets on close.
 */
/** Create-room court value meaning "no court picked yet" — the court is optional. */
const NO_COURT = "none"

function CreateRoomDialog() {
  const locale = getLocale()
  const pathname = useLocation({ select: (l) => l.pathname })
  const playScope = pathname === "/app/play"
  const {
    courts: COURTS,
    user: USER,
    conflictFor,
    courtDayGaps,
    todayIso,
    bookingDays,
    dayLabelFor,
  } = useData()
  const {
    sessions,
    hostedRoomCount,
    maxHostedRooms,
    canHostMore,
    userLevelForSport,
    userName,
  } = useSessionData()
  const { addRoom } = useSessionActions()
  const { createRoomOpen, setCreateRoomOpen } = useSessionUi()

  /** Opening window of a court ("HH:MM"); the global window backs courts with none. */
  const openHoursOf = (id: string) => {
    const c = COURTS.find((x) => x.id === id)
    return { from: c?.openFrom ?? "06:00", to: c?.openTo ?? "23:00" }
  }

  // The schema is rebuilt every render, so its refine closes over the current
  // `sessions`/`conflictFor`; useForm re-applies it via `form.update` each
  // render, so submit-time validation always sees the latest availability.
  const createRoomSchema = z
    .object({
      title: z
        .string()
        .min(5, m.match_maker_validation_title_min())
        .max(40, m.match_maker_validation_title_max()),
      sport: z.enum(["badminton"]),
      format: z.enum(["Singles", "Doubles"]),
      maxPlayers: z.number().int().min(2).max(8),
      // Optional: a room is about finding players; the court is only a
      // proposal until the host actually books one.
      courtId: z.string(),
      day: z.string().min(1),
      startTime: z.string().min(1, m.match_maker_validation_time()),
      endTime: z.string().min(1, m.match_maker_validation_time()),
      level: z.enum(["beginner", "intermediate", "advanced", "any"]),
      note: z.string().max(120, m.match_maker_validation_note_max()),
      // Self-booked court (`courtMode: "self"`): the host booked it directly
      // with a venue that isn't on the app; the room only gathers players.
      courtMode: z.enum(["app", "self"]),
      selfName: z.string(),
      selfAddress: z.string(),
      selfWard: z.string(),
      selfNote: z.string().max(80),
      selfCost: z.string(),
      selfPin: z.object({ lat: z.number(), lng: z.number() }).nullable(),
      selfConfirmed: z.boolean(),
      ranked: z.boolean(),
    })
    .refine((d) => d.endTime > d.startTime, {
      message: m.match_maker_validation_end_after_start(),
      path: ["endTime"],
    })
    .superRefine((d, ctx) => {
      if (d.courtMode !== "self") return
      const len = (s: string) => s.trim().length
      if (len(d.selfName) < 2 || len(d.selfName) > 80) {
        ctx.addIssue({
          code: "custom",
          message: m.self_court_validation_name(),
          path: ["selfName"],
        })
      }
      if (len(d.selfAddress) < 5 || len(d.selfAddress) > 200) {
        ctx.addIssue({
          code: "custom",
          message: m.self_court_validation_address(),
          path: ["selfAddress"],
        })
      }
      if (len(d.selfWard) < 1 || len(d.selfWard) > 60) {
        ctx.addIssue({
          code: "custom",
          message: m.self_court_validation_ward(),
          path: ["selfWard"],
        })
      }
      if (!d.selfPin) {
        ctx.addIssue({
          code: "custom",
          message: m.self_court_validation_pin(),
          path: ["selfPin"],
        })
      }
      const cost = d.selfCost.trim()
      if (cost && (!/^\d+$/.test(cost) || Number(cost) > SELF_COST_MAX)) {
        ctx.addIssue({
          code: "custom",
          message: m.self_court_validation_cost(),
          path: ["selfCost"],
        })
      }
    })
    // A chosen court only takes bookings inside its venue's opening hours.
    .superRefine((d, ctx) => {
      if (d.courtId === NO_COURT || d.courtMode === "self") return
      const hours = openHoursOf(d.courtId)
      if (d.startTime < hours.from || d.endTime > hours.to) {
        ctx.addIssue({
          code: "custom",
          message: m.match_maker_validation_outside_hours(hours),
          path: ["startTime"],
        })
      }
    })
    // A chosen court must actually be free for the proposed range (so a room
    // can't advertise a slot the court can't honor). Ordering is validated by
    // the refine above; skip this one until the range is sane.
    .refine(
      (d) => {
        const dur = diffMinutes(d.startTime, d.endTime)
        if (dur <= 0 || d.courtId === NO_COURT || d.courtMode === "self")
          return true
        return (
          conflictFor(sessions, {
            courtId: d.courtId,
            dayKey: d.day,
            slot: d.startTime,
            durationMin: dur,
          }) === null
        )
      },
      { message: m.match_maker_validation_slot_taken(), path: ["startTime"] }
    )

  const form = useForm({
    defaultValues: {
      title: "",
      sport: "badminton" as const,
      format: "Doubles" as "Singles" | "Doubles",
      maxPlayers: 4,
      courtId: NO_COURT,
      day: todayIso,
      startTime: "18:30",
      endTime: "19:30",
      level: userLevelForSport("badminton") as RoomLevel,
      note: "",
      courtMode: "app" as CourtMode,
      selfName: "",
      selfAddress: "",
      selfWard: "",
      selfNote: "",
      selfCost: "",
      selfPin: null as { lat: number; lng: number } | null,
      selfConfirmed: false,
      ranked: true,
    },
    validators: {
      onSubmit: createRoomSchema,
    },
    onSubmit: ({ value }) => {
      // Enforce the anti-spam cap before building the room (and keep the dialog
      // open so the user can cancel an existing room and retry).
      if (!canHostMore) {
        toast.error(m.match_maker_toast_limit_title(), {
          description: m.match_maker_toast_limit_body({ max: maxHostedRooms }),
        })
        return
      }
      const self = value.courtMode === "self"
      const court = self
        ? undefined
        : COURTS.find((c) => c.id === value.courtId)
      const capacity = value.maxPlayers
      const dayLabel = locStr(dayLabelFor(value.day), locale)
      const selfCourt: SelfCourt | undefined =
        self && value.selfPin
          ? {
              name: value.selfName.trim(),
              address: value.selfAddress.trim(),
              lat: value.selfPin.lat,
              lng: value.selfPin.lng,
              ...(value.selfNote.trim()
                ? { courtNote: value.selfNote.trim() }
                : {}),
              ...(value.selfCost.trim()
                ? { costPerPerson: Number(value.selfCost.trim()) }
                : {}),
              confirmed: value.selfConfirmed,
            }
          : undefined
      addRoom({
        ...(selfCourt
          ? { courtMode: "self" as const, selfCourt, ranked: value.ranked }
          : {}),
        // Globally unique: room ids are looked up across every user (the
        // old per-page counter collided with other players' rooms).
        id: `r-${crypto.randomUUID()}`,
        host: { name: userName, initials: USER.initials },
        title: value.title.trim(),
        // No court picked: an empty venue — the room only looks for players.
        courtId: court?.id,
        sport: value.sport,
        format: value.format,
        venue: selfCourt?.name ?? court?.name ?? "",
        ward: selfCourt ? value.selfWard.trim() : (court?.ward ?? ""),
        distanceKm: court?.distanceKm ?? null,
        day: dayLabel,
        dayKey: value.day,
        time: `${value.startTime} – ${value.endTime}`,
        durationMin: diffMinutes(value.startTime, value.endTime),
        level: value.level,
        capacity,
        joined: 1,
        players: [USER.initials],
        pricePerHour: court?.pricePerHour ?? 0,
      })
      const venueName = selfCourt?.name ?? court?.name
      toast.success(m.match_maker_toast_room_created(), {
        description: venueName
          ? `${value.title.trim()} · ${venueName}`
          : value.title.trim(),
      })
      setCreateRoomOpen(false)
      form.reset()
    },
  })

  const courtIdValue = useStore(form.store, (s) =>
    s.values.courtMode === "self" ? NO_COURT : s.values.courtId
  )
  const selfMode = useStore(form.store, (s) => s.values.courtMode === "self")
  const selfPin = useStore(form.store, (s) => s.values.selfPin)

  /**
   * A place picked from the search fills the court in one go: its address,
   * area and map pin — and its name too when picked from the name field (or
   * no name was typed yet). The host then only double-checks the pin.
   */
  const pickPlace = (hit: PlaceHit, from: "name" | "address") => {
    const values = form.state.values
    if (from === "name" || !values.selfName.trim()) {
      form.setFieldValue("selfName", hit.name.slice(0, 80))
    }
    form.setFieldValue("selfAddress", hit.address.slice(0, 200))
    if (hit.ward) form.setFieldValue("selfWard", hit.ward.slice(0, 60))
    form.setFieldValue("selfPin", { lat: hit.lat, lng: hit.lng })
    toast.success(m.self_court_search_picked({ name: hit.name }))
  }
  return (
    <Dialog
      isOpen={createRoomOpen}
      onOpenChange={(o) => {
        if (!o) form.reset()
        setCreateRoomOpen(o)
      }}
      className={cn(
        "max-h-vh-88 overflow-y-auto sm:max-w-lg",
        playScope && "player-play-overlay"
      )}
    >
      <DialogHeader>
        <DialogTitle>{m.match_maker_dialog_title()}</DialogTitle>
        <DialogDescription>
          {m.match_maker_dialog_description()}
        </DialogDescription>
      </DialogHeader>

      <form
        id="create-room-form"
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <FieldGroup>
          <form.Field name="title">
            {(field) => {
              const invalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={invalid}>
                  <FieldLabel htmlFor={field.name}>
                    {m.match_maker_dialog_room_title()}
                  </FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={invalid}
                    placeholder={m.match_maker_dialog_room_title_placeholder()}
                    autoComplete="off"
                  />
                  {invalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          </form.Field>

          <form.Field name="format">
            {(field) => (
              <Field>
                <FieldLabel>{m.match_maker_dialog_format()}</FieldLabel>
                <Select
                  aria-label={m.match_maker_dialog_format()}
                  value={field.state.value}
                  onChange={(v) =>
                    field.handleChange(v as "Singles" | "Doubles")
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="player-play-overlay">
                    <SelectItem id="Singles">
                      {m.common_format_singles()}
                    </SelectItem>
                    <SelectItem id="Doubles">
                      {m.common_format_doubles()}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
          </form.Field>

          <form.Field name="maxPlayers">
            {(field) => {
              const value = field.state.value
              return (
                <Field>
                  <FieldLabel>{m.match_maker_dialog_max_players()}</FieldLabel>
                  <div className="flex h-9 items-center gap-2">
                    <Button
                      shape="pill"
                      type="button"
                      variant="outline"
                      size="icon-sm"

                      isDisabled={value <= 2}
                      aria-label={m.match_maker_dialog_max_players_dec()}
                      onPress={() => field.handleChange(Math.max(2, value - 1))}
                    >
                      <Minus />
                    </Button>
                    <span className="w-6 text-center font-mono text-sm tabular-nums">
                      {value}
                    </span>
                    <Button
                      shape="pill"
                      type="button"
                      variant="outline"
                      size="icon-sm"

                      isDisabled={value >= 8}
                      aria-label={m.match_maker_dialog_max_players_inc()}
                      onPress={() => field.handleChange(Math.min(8, value + 1))}
                    >
                      <Plus />
                    </Button>
                  </div>
                </Field>
              )
            }}
          </form.Field>

          <form.Field name="courtMode">
            {(field) => (
              <Field>
                <FilterChips<CourtMode>
                  label={m.self_court_mode_label()}
                  value={field.state.value}
                  options={[
                    { value: "app", label: m.self_court_mode_app() },
                    { value: "self", label: m.self_court_mode_self() },
                  ]}
                  onChange={(v) => field.handleChange(v)}
                />
                {field.state.value === "self" ? (
                  <FieldDescription>
                    {m.self_court_mode_self_hint()}
                  </FieldDescription>
                ) : null}
              </Field>
            )}
          </form.Field>

          {selfMode ? (
            <>
              <form.Field name="selfName">
                {(field) => (
                  <PlaceSuggestField
                    field={field}
                    label={m.self_court_name()}
                    placeholder={m.self_court_name_placeholder()}
                    hint={m.self_court_search_hint()}
                    near={selfPin ?? HCMC_CENTER}
                    onPick={(hit) => pickPlace(hit, "name")}
                  />
                )}
              </form.Field>
              <form.Field name="selfAddress">
                {(field) => (
                  <PlaceSuggestField
                    field={field}
                    label={m.self_court_address()}
                    placeholder={m.self_court_address_placeholder()}
                    near={selfPin ?? HCMC_CENTER}
                    onPick={(hit) => pickPlace(hit, "address")}
                  />
                )}
              </form.Field>
              <div className="grid gap-7 sm:grid-cols-2">
                <form.Field name="selfWard">
                  {(field) => (
                    <TextField
                      field={field}
                      label={m.self_court_ward()}
                      placeholder={m.self_court_ward_placeholder()}
                    />
                  )}
                </form.Field>
                <form.Field name="selfNote">
                  {(field) => (
                    <TextField
                      field={field}
                      label={m.self_court_note()}
                      placeholder={m.self_court_note_placeholder()}
                    />
                  )}
                </form.Field>
              </div>
              <p className="-mt-4 px-1 text-xs text-muted-foreground">
                {m.self_court_ward_hint()}
              </p>
              <form.Field name="selfPin">
                {(field) => {
                  const invalid =
                    field.state.meta.isTouched && !field.state.meta.isValid
                  return (
                    <Field data-invalid={invalid}>
                      <FieldLabel>{m.self_court_pin()}</FieldLabel>
                      <SelfCourtPinField
                        value={field.state.value}
                        onChange={(v) => field.handleChange(v)}
                      />
                      <FieldDescription>
                        {m.self_court_pin_hint({
                          radius: SELF_CHECKIN_RADIUS_M,
                        })}
                      </FieldDescription>
                      {invalid && (
                        <FieldError errors={field.state.meta.errors} />
                      )}
                    </Field>
                  )
                }}
              </form.Field>
              <form.Field name="selfCost">
                {(field) => (
                  <TextField
                    field={field}
                    label={m.self_court_cost()}
                    placeholder={m.self_court_cost_placeholder()}
                    description={m.self_court_cost_hint()}
                    inputMode="numeric"
                  />
                )}
              </form.Field>
              <form.Field name="selfConfirmed">
                {(field) => (
                  <Field>
                    <FilterChips<"yes" | "no">
                      label={m.self_court_badge_confirmed()}
                      value={field.state.value ? "yes" : "no"}
                      options={[
                        { value: "yes", label: m.self_court_confirmed_now() },
                        { value: "no", label: m.self_court_confirmed_later() },
                      ]}
                      onChange={(v) => field.handleChange(v === "yes")}
                    />
                    {field.state.value ? null : (
                      <FieldDescription>
                        {m.self_court_confirmed_hint()}
                      </FieldDescription>
                    )}
                  </Field>
                )}
              </form.Field>
              <form.Field name="ranked">
                {(field) => (
                  <Field>
                    <FilterChips<"ranked" | "friendly">
                      label={m.self_court_ranked()}
                      value={field.state.value ? "ranked" : "friendly"}
                      options={[
                        { value: "ranked", label: m.self_court_ranked_on() },
                        { value: "friendly", label: m.self_court_ranked_off() },
                      ]}
                      onChange={(v) => field.handleChange(v === "ranked")}
                    />
                    <FieldDescription>
                      {m.self_court_ranked_hint()}
                    </FieldDescription>
                  </Field>
                )}
              </form.Field>
            </>
          ) : null}

          <form.Field name="courtId">
            {(field) => (
              <Field className={cn(selfMode && "hidden")}>
                <FieldLabel>{m.match_maker_dialog_court_optional()}</FieldLabel>
                <Select
                  aria-label={m.match_maker_dialog_court_optional()}
                  value={field.state.value}
                  onChange={(v) => field.handleChange(v as string)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="player-play-overlay">
                    <SelectItem id={NO_COURT}>
                      {m.match_maker_dialog_no_court()}
                    </SelectItem>
                    {COURTS.map((c) => (
                      <SelectItem key={c.id} id={c.id}>
                        {c.name} ·{" "}
                        {[c.ward, c.province].filter(Boolean).join(", ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {m.match_maker_dialog_court_note()}
                </FieldDescription>
              </Field>
            )}
          </form.Field>

          <form.Field name="day">
            {(field) => (
              <Field>
                <FieldLabel>{m.match_maker_dialog_when()}</FieldLabel>
                <FilterChips
                  label=""
                  value={field.state.value}
                  options={bookingDays.map((d) => ({
                    value: d.key,
                    label: locStr(d.label, locale),
                  }))}
                  onChange={(v) => field.handleChange(v)}
                />
              </Field>
            )}
          </form.Field>

          <div className="grid gap-7 sm:grid-cols-2">
            <form.Field name="startTime">
              {(field) => {
                const invalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={invalid}>
                    <FieldLabel>{m.match_maker_dialog_start_time()}</FieldLabel>
                    <Input
                      type="time"
                      min={openHoursOf(courtIdValue).from}
                      max={openHoursOf(courtIdValue).to}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={invalid}
                    />
                    {invalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                )
              }}
            </form.Field>

            <form.Field name="endTime">
              {(field) => {
                const invalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={invalid}>
                    <FieldLabel>{m.match_maker_dialog_end_time()}</FieldLabel>
                    <Input
                      type="time"
                      min={openHoursOf(courtIdValue).from}
                      max={openHoursOf(courtIdValue).to}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={invalid}
                    />
                    {invalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                )
              }}
            </form.Field>
          </div>

          <form.Subscribe
            selector={(s) => ({
              // A self-booked court isn't in the app's calendar to check.
              courtId:
                s.values.courtMode === "self" ? NO_COURT : s.values.courtId,
              day: s.values.day,
              startTime: s.values.startTime,
              endTime: s.values.endTime,
            })}
          >
            {({ courtId, day, startTime, endTime }) => {
              const dur = diffMinutes(startTime, endTime)
              if (
                !courtId ||
                courtId === NO_COURT ||
                !startTime ||
                !endTime ||
                dur <= 0
              )
                return null
              const conflict = conflictFor(sessions, {
                courtId,
                dayKey: day,
                slot: startTime,
                durationMin: dur,
              })
              const free = conflict
                ? courtDayGaps(sessions, courtId, day).find(
                    (g) => g.durationMin >= dur
                  )
                : null
              return (
                <div
                  className={cn(
                    "flex flex-col gap-1 rounded-2xl px-3 py-2.5 text-sm ring-1",
                    conflict
                      ? "bg-destructive/8 ring-destructive/20"
                      : "bg-brand/8 ring-brand/15"
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 font-medium",
                      conflict ? "text-destructive" : "text-brand"
                    )}
                  >
                    {conflict ? (
                      <TriangleAlert className="size-4 shrink-0" />
                    ) : (
                      <Check className="size-4 shrink-0" />
                    )}
                    {conflict === "self-overlap"
                      ? m.booking_conflict_self()
                      : conflict
                        ? m.booking_conflict_court()
                        : m.booking_available()}
                  </span>
                  {conflict && free ? (
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      {m.booking_free_at({ time: free.start })}
                    </span>
                  ) : null}
                </div>
              )
            }}
          </form.Subscribe>

          <form.Field name="level">
            {(field) => {
              return (
                <Field>
                  <FieldLabel>{m.match_maker_dialog_level()}</FieldLabel>
                  <Select
                    aria-label={m.match_maker_dialog_level()}
                    value={field.state.value}
                    onChange={(v) => field.handleChange(v as RoomLevel)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="player-play-overlay">
                      {LEVELS.map((l) => (
                        <SelectItem key={l.value} id={l.value}>
                          {levelsMessages[l.value]()}
                        </SelectItem>
                      ))}
                      <SelectItem id="any">{m.common_level_any()}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )
            }}
          </form.Field>

          <form.Field name="note">
            {(field) => {
              const invalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={invalid}>
                  <FieldLabel htmlFor={field.name}>
                    {m.match_maker_dialog_note()}
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupTextarea
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder={m.match_maker_dialog_note_placeholder()}
                      rows={3}
                      className="min-h-16 resize-none"
                      aria-invalid={invalid}
                    />
                    <InputGroupAddon align="block-end">
                      <InputGroupText className="tabular-nums">
                        {field.state.value.length}/120
                      </InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                  {invalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          </form.Field>
        </FieldGroup>
      </form>

      <p
        className={cn(
          "px-1 text-xs",
          canHostMore
            ? "text-muted-foreground"
            : "text-amber-600 dark:text-amber-400"
        )}
      >
        {canHostMore
          ? m.match_maker_dialog_room_quota({
              count: hostedRoomCount,
              max: maxHostedRooms,
            })
          : m.match_maker_dialog_room_limit_reached({ max: maxHostedRooms })}
      </p>

      <DialogFooter>
        <DialogClose>{m.match_maker_dialog_cancel()}</DialogClose>
        <Button type="submit" form="create-room-form" isDisabled={!canHostMore}>
          <Plus />
          {m.match_maker_create_room()}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

/**
 * Persistent Match Maker dialogs (Quick Join + Create Room). Mounted in the
 * player chrome so the topbar's section actions can open them from anywhere and
 * their in-flight state survives navigation, mirroring the booking wizard.
 */
export function MatchMakerDialogs() {
  return (
    <>
      <QuickJoinDialog />
      <CreateRoomDialog />
    </>
  )
}
