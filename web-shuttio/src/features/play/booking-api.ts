import type { BookingRecord } from "@/lib/shared"

import { apiResult } from "@/lib/api"
import type { ApiResult } from "@/lib/api"

// Client calls for the player-facing bookings API (Phase 3, VienTD-Review
// decision #8) — the narrow POST /api/bookings/* routes layered on top of the
// canonical `bookings` collection. `session.tsx`'s `reserveHold` (called from
// `pay`, Phase 4) awaits `createBookingHold` at the moment a court+slot is
// actually reserved (the server computes the 20-minute hold expiry now,
// replacing the old client-only HOLD_MS timer / PUT-triggered cross-write),
// and `cancelBooking` awaits `cancelBookingRecord` so the refund policy
// (≥24h/<24h/after-start) runs server-side instead of being simulated
// locally.
//
// These return an `ApiResult` instead of throwing so callers can branch on
// the HTTP status (e.g. a 409 slot conflict).

/** Everything a player/venue caller needs back from a booking mutation. */
export type BookingSummary = Pick<
  BookingRecord,
  | "bookingId"
  | "venueId"
  | "courtId"
  | "courtName"
  | "sport"
  | "source"
  | "userId"
  | "sessionId"
  | "startAt"
  | "endAt"
  | "dateKey"
  | "start"
  | "durationMin"
  | "price"
  | "status"
  | "paymentStatus"
  | "holdExpiresAt"
  | "confirmDeadlineAt"
  | "checkedInAt"
  | "declineReason"
  | "cancelReason"
  | "refund"
  | "cancelRequest"
  | "paymentMethod"
  | "amountDue"
  | "discountCode"
  | "discountAmount"
  | "originalAmount"
  | "transferMemo"
  | "payoutSnapshot"
  | "paymentProofUrl"
  | "proofSubmittedAt"
  | "rejectReason"
  | "refundAccount"
  | "refundProofUrl"
  | "refundConfirmation"
>

export interface CreateBookingHoldInput {
  courtId: string
  dateKey: string
  start: string
  durationMin: number
  /** The forming PlaySession this hold belongs to, if booked from a room. */
  sessionId?: string
}

/** The outcome of a booking-API call — `status` lets the caller branch on a 409. */
export type BookingActionResult<T> = ApiResult<T>

// The API's AllExceptionsFilter maps every failure to `{ error: message }`
// (see CLAUDE.md § API); better-fetch (`throw: true`) surfaces that parsed
// body as `BetterFetchError.error`, alongside `.status`. Unwrap both into the
// plain result shape above.
/**
 * Create a booking the player is about to pay for — `POST /api/bookings`.
 * There is no hold: it never expires and doesn't block the slot. Validates
 * opening hours and the court's payout account server-side; a slot a
 * confirmed booking already holds comes back as `{ ok: false, status: 409 }`.
 */
export async function createBookingHold(
  input: CreateBookingHoldInput
): Promise<BookingActionResult<BookingSummary>> {
  return apiResult<BookingSummary>("/api/bookings", {
    method: "POST",
    body: input,
  })
}

/**
 * Cancel the caller's own booking — `POST /api/bookings/:id/cancel`. Only
 * allowed before a transfer proof was sent; after that the player and venue
 * settle it in chat and the venue cancels + refunds.
 */
export async function cancelBookingRecord(
  bookingId: string,
  reason?: string
): Promise<BookingActionResult<BookingSummary>> {
  return apiResult<BookingSummary>(
    `/api/bookings/${encodeURIComponent(bookingId)}/cancel`,
    { method: "POST", body: reason ? { reason } : {} }
  )
}
