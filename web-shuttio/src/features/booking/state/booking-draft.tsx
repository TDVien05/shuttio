import * as React from "react"
import { useRouter } from "@tanstack/react-router"

import { activeRoster, COURT_OPEN_FROM, COURT_OPEN_TO } from "@/lib/shared"
import type { PlaySession } from "@/lib/shared"
import { useData } from "@/features/dashboard/components/data-provider"

/** Fill mode chosen at the "do you have a team yet?" gate. */
export type FillMode = "court" | "invite" | "find"

/** The booking wizard's steps, in order. */
export type BookingStep = "court" | "slot" | "players" | "confirm" | "pay"

export interface BookingDraft {
  dayKey: string
  slot: string | null
  /** Free-form session length in minutes (not tied to the hour). */
  durationMin: number
  fillMode: FillMode
  invitees: string[]
}

/**
 * Options for arming the booking wizard. `linked` passes a session created in
 * the same tick (its query write hasn't flushed yet), so the wizard can prefill
 * from it instead of looking `linkedId` up in stale state.
 */
export interface BookingOpts {
  roomId?: string
  fillMode?: FillMode
  invitees?: string[]
  linked?: PlaySession
}

interface BookingDraftContextValue {
  open: boolean
  courtId: string | null
  /** The session this booking is growing from, if any. */
  linkedId: string | null
  /** True when the wizard was started without a court (the first step picks one). */
  courtless: boolean
  step: number
  draft: BookingDraft
  checkoutError: string | null
  armBooking: (courtId: string | null, opts?: BookingOpts) => void
  closeBooking: () => void
  setStep: React.Dispatch<React.SetStateAction<number>>
  setCourt: (courtId: string) => void
  setDay: (dayKey: string) => void
  setSlot: (slot: string) => void
  setDuration: (durationMin: number) => void
  pickSlot: (slot: string, durationMin: number) => void
  setFillMode: (mode: FillMode) => void
  toggleInvite: (initials: string) => void
  setLinkedId: (id: string | null) => void
  setCheckoutError: (message: string | null) => void
  clearCheckoutError: () => void
}

/**
 * Seats a booked court holds (host + up to 3 invitees). Bookings no longer pick
 * singles/doubles, so team size is a fixed cap rather than derived from a format.
 */
export const BOOKING_CAPACITY = 4

const BookingDraftContext =
  React.createContext<BookingDraftContextValue | null>(null)

export function useBookingDraft() {
  const ctx = React.useContext(BookingDraftContext)
  if (!ctx) {
    throw new Error(
      "useBookingDraft must be used within a BookingDraftProvider."
    )
  }
  return ctx
}

function emptyDraft(todayIso: string): BookingDraft {
  return {
    dayKey: todayIso,
    slot: null,
    durationMin: 60,
    fillMode: "court",
    invitees: [],
  }
}

/**
 * Keep a chosen start time inside the court's open window. The native `<input
 * type="time">` will happily yield values outside open hours (e.g. midnight
 * from the spinner), which would land the selection above/below the day
 * calendar and render an invisible band. Zero-padded "HH:MM" strings compare
 * lexicographically, so a string clamp is enough. Empty → null (no selection).
 */
function clampSlot(
  slot: string,
  from: string = COURT_OPEN_FROM,
  to: string = COURT_OPEN_TO
): string | null {
  if (!slot) return null
  if (slot < from) return from
  if (slot > to) return to
  return slot
}

/**
 * The booking wizard's UI state, mounted at the `/app` layout so a draft
 * survives navigation to `/app/book`. It deliberately holds no server data:
 * sessions, conflicts and the pay mutation live in {@link useBookingWizard}.
 */
export function BookingDraftProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { todayIso, user, courts } = useData()
  const [open, setOpen] = React.useState(false)
  const [courtId, setCourtId] = React.useState<string | null>(null)
  const [linkedId, setLinkedId] = React.useState<string | null>(null)
  const [courtless, setCourtless] = React.useState(false)
  const [step, setStep] = React.useState(0)
  const [draft, setDraft] = React.useState<BookingDraft>(() =>
    emptyDraft(todayIso)
  )
  const [checkoutError, setCheckoutError] = React.useState<string | null>(null)

  const armBooking = React.useCallback(
    (nextCourtId: string | null, opts?: BookingOpts) => {
      const rid = opts?.roomId ?? null
      const linked = opts?.linked ?? null
      setOpen(false)
      setCourtId(nextCourtId)
      setLinkedId(rid)
      setCourtless(nextCourtId === null)
      setStep(0)
      setCheckoutError(null)
      setDraft({
        dayKey: linked ? linked.dayKey : todayIso,
        // Carry the room's proposed start so the wizard pre-fills it (and
        // surfaces any conflict on that exact slot) instead of blanking it.
        slot: linked ? linked.slot : null,
        durationMin: linked ? linked.durationMin : 60,
        fillMode: linked ? "court" : (opts?.fillMode ?? "court"),
        invitees: linked
          ? activeRoster(linked)
              .map((p) => p.initials)
              .filter((p) => p !== user.initials)
          : (opts?.invitees ?? []),
      })
      setOpen(true)
    },
    [todayIso, user.initials]
  )

  const closeBooking = React.useCallback(() => {
    setCheckoutError(null)
    setOpen(false)
    // Return to wherever the wizard was opened from.
    router.history.back()
  }, [router])

  const setCourt = React.useCallback((id: string) => setCourtId(id), [])

  const setDay = React.useCallback(
    (dayKey: string) => setDraft((d) => ({ ...d, dayKey, slot: null })),
    []
  )

  const setSlot = React.useCallback(
    (slot: string) => {
      const court = courtId
        ? (courts.find((c) => c.id === courtId) ?? null)
        : null
      setDraft((d) => ({
        ...d,
        slot: clampSlot(slot, court?.openFrom, court?.openTo),
      }))
    },
    [courtId, courts]
  )

  const setDuration = React.useCallback(
    (durationMin: number) =>
      setDraft((d) => ({
        ...d,
        durationMin: Math.max(15, Math.min(300, durationMin)),
      })),
    []
  )

  const pickSlot = React.useCallback(
    (slot: string, durationMin: number) =>
      setDraft((d) => ({
        ...d,
        slot: slot || null,
        durationMin: Math.max(15, Math.min(300, durationMin)),
      })),
    []
  )

  const setFillMode = React.useCallback(
    (fillMode: FillMode) => setDraft((d) => ({ ...d, fillMode })),
    []
  )

  const toggleInvite = React.useCallback(
    (initials: string) =>
      setDraft((d) => {
        if (d.invitees.includes(initials))
          return { ...d, invitees: d.invitees.filter((i) => i !== initials) }
        if (d.invitees.length >= BOOKING_CAPACITY - 1) return d
        return { ...d, invitees: [...d.invitees, initials] }
      }),
    []
  )

  const clearCheckoutError = React.useCallback(() => setCheckoutError(null), [])

  const value = React.useMemo<BookingDraftContextValue>(
    () => ({
      open,
      courtId,
      linkedId,
      courtless,
      step,
      draft,
      checkoutError,
      armBooking,
      closeBooking,
      setStep,
      setCourt,
      setDay,
      setSlot,
      setDuration,
      pickSlot,
      setFillMode,
      toggleInvite,
      setLinkedId,
      setCheckoutError,
      clearCheckoutError,
    }),
    [
      open,
      courtId,
      linkedId,
      courtless,
      step,
      draft,
      checkoutError,
      armBooking,
      closeBooking,
      setCourt,
      setDay,
      setSlot,
      setDuration,
      pickSlot,
      setFillMode,
      toggleInvite,
      clearCheckoutError,
    ]
  )

  return (
    <BookingDraftContext.Provider value={value}>
      {children}
    </BookingDraftContext.Provider>
  )
}
