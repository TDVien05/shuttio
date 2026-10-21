import { useMutation, useQueryClient } from "@tanstack/react-query"

import { queryKeys } from "@/lib/query-keys"
import type { BookingSummary } from "@/features/booking/api/booking-api"
import type { BookingDraft } from "@/features/booking/state/booking-draft"
import { BOOKING_CAPACITY } from "@/features/booking/state/booking-draft"
import { createBookingHold } from "@/features/booking/api/booking-api"
import { saveSession } from "@/features/play/api/session-api"
import { upsertSession } from "@/features/play/api/session.queries"
import { m } from "@/paraglide/messages"
import type { Court, Level, PlaySession, SportKey } from "@/lib/shared"

/** A failure from `POST /api/bookings`, carrying the HTTP status to branch on. */
export class CreateHoldError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = "CreateHoldError"
  }
}

export interface CreateHoldInput {
  court: Court
  draft: BookingDraft
  /** The forming room this booking grows from, if any. */
  linked: PlaySession | null
  userName: string
  userInitials: string
  levelForSport: (sport: SportKey) => Level
  dayLabel: string
}

export interface CreateHoldResult {
  summary: BookingSummary
  session: PlaySession
}

const sportsMessages = {
  badminton: m.common_sports_badminton,
} as const

let holdSequence = 0

function newSessionId(): string {
  return `s-bk-${Date.now().toString(36)}-${holdSequence++}`
}

/**
 * Create (or reuse) the server-side booking hold for the wizard's draft, then
 * link it to a PlaySession.
 *
 * Both requests are awaited: `POST /api/bookings` is idempotent on the slot,
 * so a retry after a reload reuses the same `awaiting_payment` record, and a
 * failed `PUT /api/sessions/:id` surfaces as an error instead of silently
 * losing the session ↔ booking linkage. The cache gets the built session
 * immediately, then refetches so the server-derived view wins.
 */
export function useCreateBookingHold() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateHoldInput): Promise<CreateHoldResult> => {
      const { court, draft, linked } = input
      const start = draft.slot
      if (!start) throw new Error("Cannot create a hold without a start time")

      const sessionId = linked?.id ?? newSessionId()
      const result = await createBookingHold({
        courtId: court.id,
        dateKey: draft.dayKey,
        start,
        durationMin: draft.durationMin,
        sessionId,
      })
      if (!result.ok) {
        throw new CreateHoldError(result.status, result.message)
      }
      const summary = result.data

      let session: PlaySession
      if (linked) {
        // Transition the existing forming room into a held booking. It arrives
        // `awaiting_payment`; the payment screen and the venue's approval both
        // flow back through `GET /api/sessions`.
        session = {
          ...linked,
          status: "booked",
          hold: "pending",
          paymentStatus: "awaiting",
          paymentExpiresAt: summary.holdExpiresAt,
          holdExpiresAt: undefined,
          courtId: court.id,
          courtLabel: summary.courtName,
          dayKey: draft.dayKey,
          dayLabel: input.dayLabel,
          slot: start,
          durationMin: draft.durationMin,
          venue: court.name,
          ward: court.ward,
          distanceKm: court.distanceKm,
          pricePerHour: court.pricePerHour,
          venueId: summary.venueId,
          reservationId: summary.bookingId,
        }
      } else {
        // A brand-new, court-first booking: always a solo court hold. The host
        // grows it into a room (and invites players) afterward.
        const sport = summary.sport
        session = {
          // The server's sessionId survives a reload; prefer it over a fresh id
          // so a retry re-links the same persisted session.
          id: summary.sessionId ?? sessionId,
          title: m.booking_room_title({
            sport: sportsMessages[sport as keyof typeof sportsMessages](),
            court: court.name,
          }),
          sport,
          format: "Doubles",
          courtId: court.id,
          dayKey: draft.dayKey,
          dayLabel: input.dayLabel,
          slot: start,
          durationMin: draft.durationMin,
          courtLabel: summary.courtName,
          host: { name: input.userName, initials: input.userInitials },
          capacity: BOOKING_CAPACITY,
          roster: [
            {
              name: input.userName,
              initials: input.userInitials,
              rsvp: "host",
            },
          ],
          level: input.levelForSport(sport),
          status: "booked",
          hold: "pending",
          paymentStatus: "awaiting",
          paymentExpiresAt: summary.holdExpiresAt,
          listed: false,
          fillIntent: "court",
          venue: court.name,
          ward: court.ward,
          distanceKm: court.distanceKm,
          pricePerHour: court.pricePerHour,
          venueId: summary.venueId,
          reservationId: summary.bookingId,
        }
      }

      await saveSession(session)
      return { summary, session }
    },

    onSuccess: ({ session }) => {
      queryClient.setQueryData<PlaySession[]>(queryKeys.sessions(), (current) =>
        upsertSession(current, session)
      )
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.seed() })
    },
  })
}
