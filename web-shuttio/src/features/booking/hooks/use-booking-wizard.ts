import * as React from "react"
import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { toast } from "sonner"

import { locStr } from "@/lib/shared"
import type { CourtBand, Conflict } from "@/lib/shared"
import { dashboardQueries } from "@/features/dashboard/api/dashboard.queries"
import { getLocale } from "@/paraglide/runtime"
import { m } from "@/paraglide/messages"
import { useData } from "@/features/dashboard/components/data-provider"
import { usePlayerIdentity } from "@/features/play/hooks/use-player-identity"
import { sessionQueries } from "@/features/play/api/session.queries"
import {
  courtBusy as courtBusyFor,
  courtGaps as courtGapsFor,
  draftConflict as draftConflictFor,
  draftCourt,
  slotBlocked as slotBlockedFor,
} from "@/features/play/lib/matchmaking-derive"
import {
  CreateHoldError,
  useCreateBookingHold,
} from "@/features/booking/api/booking.queries"
import { useBookingDraft } from "@/features/booking/state/booking-draft"
import type {
  BookingOpts,
  BookingStep,
} from "@/features/booking/state/booking-draft"

/** The dedicated booking-wizard route the Play / book actions navigate to. */
const BOOK_PATH = "/app/book"

/**
 * The booking wizard's server-derived view plus its write path. The UI fields
 * live in {@link useBookingDraft}; this hook combines them with the sessions
 * query and the idempotent hold mutation.
 */
export function useBookingWizard() {
  const router = useRouter()
  const locale = getLocale()
  const { user, courts, dayLabelFor } = useData()
  const { data: seed, dataUpdatedAt: seedUpdatedAt } = useSuspenseQuery(
    dashboardQueries.seed()
  )
  const identity = usePlayerIdentity()
  const { userName, userLevelForSport } = identity
  const draftState = useBookingDraft()
  const {
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
  } = draftState

  const { data: sessions = seed.sessions } = useQuery({
    ...sessionQueries.mine(),
    initialData: seed.sessions,
    initialDataUpdatedAt: seedUpdatedAt,
  })

  const linkedSession = React.useMemo(
    () => (linkedId ? (sessions.find((s) => s.id === linkedId) ?? null) : null),
    [linkedId, sessions]
  )
  const court = React.useMemo(
    () => draftCourt(courts, courtId),
    [courts, courtId]
  )
  const steps: BookingStep[] = courtless
    ? ["court", "slot", "confirm", "pay"]
    : ["slot", "confirm", "pay"]

  const ignoreId = linkedId ?? undefined
  const slotBlocked = React.useCallback(
    (slot: string) =>
      slotBlockedFor(
        sessions,
        courts,
        user,
        courtId,
        draft.dayKey,
        slot,
        draft.durationMin,
        ignoreId
      ),
    [sessions, courts, user, courtId, draft.dayKey, draft.durationMin, ignoreId]
  )

  const draftConflict: Conflict = React.useMemo(
    () =>
      draftConflictFor(
        sessions,
        courts,
        user,
        courtId,
        draft.dayKey,
        draft.slot,
        draft.durationMin,
        ignoreId
      ),
    [
      sessions,
      courts,
      user,
      courtId,
      draft.dayKey,
      draft.slot,
      draft.durationMin,
      ignoreId,
    ]
  )

  const courtBusy: CourtBand[] = React.useMemo(
    () => courtBusyFor(sessions, courts, courtId, draft.dayKey, ignoreId),
    [sessions, courts, courtId, draft.dayKey, ignoreId]
  )
  const courtGaps: CourtBand[] = React.useMemo(
    () => courtGapsFor(sessions, courts, courtId, draft.dayKey, ignoreId),
    [sessions, courts, courtId, draft.dayKey, ignoreId]
  )

  const createHold = useCreateBookingHold()
  const paying = createHold.isPending

  const next = React.useCallback(
    () => setStep((current) => Math.min(steps.length - 1, current + 1)),
    [setStep, steps.length]
  )
  const back = React.useCallback(() => {
    // Once checkout has created a reservation, retries must pay that exact
    // court and slot. Editing the draft would leave the old reservation linked.
    if (linkedSession?.reservationId) return
    setStep((current) => Math.max(0, current - 1))
  }, [linkedSession?.reservationId, setStep])

  const resumePayment = React.useCallback(
    (bookingId: string, query = "") => {
      void router.navigate({
        href: `/app/payment/${encodeURIComponent(bookingId)}${query}`,
      })
    },
    [router]
  )

  /** Arm the wizard and navigate to the dedicated booking page. */
  const openBooking = React.useCallback(
    (nextCourtId: string | null, opts?: BookingOpts) => {
      armBooking(nextCourtId, opts)
      void router.navigate({ href: BOOK_PATH })
    },
    [armBooking, router]
  )

  /** Book a court for an existing forming room (active-session pill). */
  const bookCourtForSession = React.useCallback(
    (sessionId: string) => {
      const session = sessions.find((s) => s.id === sessionId)
      if (!session) return
      if (session.reservationId) {
        resumePayment(session.reservationId)
        return
      }
      // A room's proposed venue is not a reservation. Let the host choose the
      // court explicitly while keeping the room's schedule and roster linked.
      openBooking(null, { roomId: sessionId, linked: session })
    },
    [openBooking, resumePayment, sessions]
  )

  /**
   * Re-book a past/cancelled booking as a fresh solo court hold. The wizard no
   * longer gathers a team; the host grows the new booking into a room and
   * invites afterward (same as any fresh booking).
   */
  const rebookFrom = React.useCallback(
    (bookingId: string) => {
      const session = sessions.find((s) => s.id === bookingId)
      if (!session) {
        openBooking(null)
        return
      }
      const nextCourtId =
        session.courtId ??
        courts.find((c) => c.name === session.venue)?.id ??
        null
      openBooking(nextCourtId, { linked: session })
    },
    [courts, openBooking, sessions]
  )

  /**
   * Create the booking (reusing the server's hold on a retry) and open the
   * bank-transfer payment screen. Nothing is charged here: the player transfers
   * to the venue's account and uploads a screenshot on that screen.
   */
  const pay = React.useCallback(
    (discountCode?: string) => {
      if (!court || !draft.slot || createHold.isPending) return
      if (draftConflict) {
        toast.error(m.booking_toast_conflict())
        return
      }
      setCheckoutError(null)
      void (async () => {
        try {
          const { summary, session } = await createHold.mutateAsync({
            court,
            draft,
            linked: linkedSession,
            userName,
            userInitials: user.initials,
            levelForSport: userLevelForSport,
            dayLabel: locStr(dayLabelFor(draft.dayKey), locale),
          })
          if (linkedId !== session.id) setLinkedId(session.id)
          const query = discountCode
            ? `?discount=${encodeURIComponent(discountCode)}`
            : ""
          resumePayment(summary.bookingId, query)
        } catch (error) {
          if (error instanceof CreateHoldError) {
            if (error.status !== 409) {
              console.error("Failed to create booking hold", error.message)
            }
            // 422 = the venue can't answer before play time (see createHold) —
            // the server's message names the time it will reply, so show it.
            toast.error(
              error.status === 422 ? error.message : m.booking_toast_conflict()
            )
            return
          }
          console.error("Failed to create the booking", error)
          setCheckoutError(m.booking_pay_checkout_failed())
        }
      })()
    },
    [
      court,
      createHold,
      draft,
      draftConflict,
      linkedId,
      linkedSession,
      locale,
      dayLabelFor,
      resumePayment,
      router,
      setCheckoutError,
      setLinkedId,
      user.initials,
      userLevelForSport,
      userName,
    ]
  )

  return {
    // UI state
    open,
    courtId,
    roomId: linkedId,
    linkedSession,
    courtless,
    court,
    steps,
    step,
    draft,
    checkoutError,
    paying,
    // Server data the wizard renders
    sessions,
    // Wizard actions
    armBooking,
    openBooking,
    closeBooking,
    bookCourtForSession,
    rebookFrom,
    resumePayment,
    next,
    back,
    setCourt,
    setDay,
    setSlot,
    setDuration,
    pickSlot,
    setFillMode,
    toggleInvite,
    clearCheckoutError,
    pay,
    // Derived conflicts
    slotBlocked,
    draftConflict,
    courtBusy,
    courtGaps,
  }
}
