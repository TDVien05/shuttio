import type {
  BankAccount,
  BankInfo,
  CourtBlock,
  CourtBlockReason,
  Reservation,
  ReservationStatus,
  SportKey,
  Venue,
  VenueCourt,
  VenueCustomer,
  VenueSeed,
} from "@/lib/shared"

import { api } from "@/lib/api"
import { queryClient } from "@/lib/query-client"

// Client calls for venue management. Each write hits the API's CRUD routes,
// then invalidates the affected queries (the branch's `["venue", id]` bundle,
// or everything for account-level changes) so open screens refetch. `api`
// (lib/api.ts) attaches the Clerk bearer token and throws an `ApiError`
// carrying the API's message, so callers can just `catch` it.

export interface VenueInput {
  name: string
  image?: string
  description?: string
  ward: string
  province: string
  sports: SportKey[]
  openFrom: string
  openTo: string
  /** Map position (WGS84) — from geolocation or manual entry in the setup wizard. */
  lat?: number
  lng?: number
  managerName: string
}

export interface CourtInput {
  name: string
  sport: SportKey
  surface: string
  pricePerHour: number
  state?: VenueCourt["state"]
}

/** One branch's profile inside a setup-wizard payload — no courts (plan 020):
 *  courts are added afterwards on the per-branch "Sân" screen. */
export type BranchInput = Omit<VenueInput, "managerName">

export interface VenueSetupInput {
  /** Brand name (thương hiệu) — only sent on first-time setup; ignored once
   *  the account already has a brand. */
  brandName?: string
  /** Required on first-time setup; reused from the account's existing branch
   *  (and so omittable) when adding another branch. */
  managerName?: string
  /** Owner contact phone for admins — required on first-time setup. */
  contactPhone?: string
  /** Where players transfer booking money (VietQR) — sent on first-time setup. */
  payout?: PayoutInput
  branches: BranchInput[]
}

/** The bank account players pay into (the bank is identified by its bin). */
export interface PayoutInput {
  bankBin: string
  accountNo: string
  accountName: string
}

export interface WalkInReservationInput {
  courtId: string
  dayKey: string
  start: string
  durationMin: number
  customerName: string
  customerPhone: string
}

/** Fresh operator reservation list for the live approval queue. */
export async function fetchVenueReservations(
  venueId: string
): Promise<Reservation[]> {
  const seed = await api<VenueSeed>(`/api/venue/${venueId}/bundle`)
  return seed.reservations
}

// An account's brand may own many venue branches (chi nhánh), so every branch-
// scoped route carries the target `venueId` in the path (`/api/venues/:venueId/…`)
// and the API authorizes the caller owns it. The same id also keys the
// `["venue", id]` query invalidated after a write.

/**
 * Provision a venue branch from the guided setup wizard (the first branch also
 * mints the account's brand). Returns the new branch's id so the wizard can land
 * the operator directly on it — even when it's their second or third branch.
 */
export async function provisionVenue(input: VenueSetupInput): Promise<string> {
  const seed = await api<VenueSeed>("/api/venue/setup", {
    method: "POST",
    body: input,
  })
  void queryClient.invalidateQueries()
  return seed.info.id
}

/** The banks a VietQR transfer can target (cached server-side for a day). */
export async function listBanks(): Promise<BankInfo[]> {
  return api<BankInfo[]>("/api/banks")
}

/**
 * Resolve an account holder name from the bank's NAPAS bin and account number.
 * Returns the name (UPPERCASE, accent-free) on success, or null when the
 * account isn't found or the lookup service is unavailable.
 */
export async function lookupBankAccount(
  bin: string,
  accountNumber: string
): Promise<string | null> {
  try {
    const res = await api<{ accountName: string | null }>("/api/banks/lookup", {
      method: "POST",
      body: { bin, accountNumber },
    })
    return res.accountName ?? null
  } catch {
    return null
  }
}

/** The signed-in owner's saved payout account, or null while none is set. */
export async function getPayout(): Promise<BankAccount | null> {
  const res = await api<{ payout: BankAccount | null }>("/api/brands/me/payout")
  return res.payout
}

/**
 * Save the owner's payout account. Returns a result object (not a throw) so
 * the form can show the API's message — e.g. a bad account number.
 */
export async function savePayout(
  input: PayoutInput
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await api("/api/brands/me/payout", {
      method: "PUT",
      body: input,
    })
    void queryClient.invalidateQueries()
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Request failed",
    }
  }
}

/** Signed params for one direct browser → Cloudinary upload (api: venue-photos). */
export interface VenuePhotoUploadSignature {
  cloudName: string
  apiKey: string
  timestamp: number
  folder: string
  allowedFormats: string
  signature: string
}

/**
 * A short-lived signature to upload one photo of `venueId` straight to
 * Cloudinary. The api only signs for the venue's own operator; the Cloudinary
 * secret never reaches the browser.
 */
export async function signVenuePhotoUpload(
  venueId: string
): Promise<VenuePhotoUploadSignature> {
  return api<VenuePhotoUploadSignature>(
    `/api/venues/${venueId}/photos/signature`,
    { method: "POST" }
  )
}

/** Replace the venue's photo gallery (order = display order, first = cover). */
export async function saveVenuePhotos(
  venueId: string,
  photos: string[]
): Promise<string[]> {
  const res = await api<{ photos: string[] }>(`/api/venues/${venueId}/photos`, {
    method: "PUT",
    body: { photos },
  })
  // The operator's workspace and every player surface (court cards, booking).
  void queryClient.invalidateQueries()
  return res.photos
}

export async function updateVenue(
  id: string,
  input: Partial<VenueInput>
): Promise<Venue> {
  const venue = await api<Venue>(`/api/venues/${id}`, {
    method: "PUT",
    body: input,
  })
  void queryClient.invalidateQueries()
  return venue
}

/**
 * Archive (soft-delete) a branch — VienTD-Review decision #11.
 * `DELETE /api/venues/:venueId` 409s with a Vietnamese message when the branch
 * still has a pending/confirmed booking in the future; callers should surface
 * that message and offer a link to the reservations screen rather than retry.
 */
export async function archiveVenue(id: string): Promise<void> {
  await api(`/api/venues/${id}`, { method: "DELETE" })
  void queryClient.invalidateQueries()
}

/** Restore a previously archived branch (clears `archived`). */
export async function restoreVenue(id: string): Promise<Venue> {
  const venue = await api<Venue>(`/api/venues/${id}`, {
    method: "PUT",
    body: { archived: false },
  })
  void queryClient.invalidateQueries()
  return venue
}

export async function addCourt(
  venueId: string,
  input: CourtInput
): Promise<VenueCourt> {
  const court = await api<VenueCourt>(`/api/venues/${venueId}/courts`, {
    method: "POST",
    body: input,
  })
  void queryClient.invalidateQueries({ queryKey: ["venue", venueId] })
  return court
}

export async function updateCourt(
  venueId: string,
  courtId: string,
  input: Partial<CourtInput>
): Promise<VenueCourt> {
  const court = await api<VenueCourt>(
    `/api/venues/${venueId}/courts/${courtId}`,
    {
      method: "PUT",
      body: input,
    }
  )
  void queryClient.invalidateQueries({ queryKey: ["venue", venueId] })
  return court
}

export async function deleteCourt(
  venueId: string,
  courtId: string
): Promise<void> {
  await api(`/api/venues/${venueId}/courts/${courtId}`, { method: "DELETE" })
  void queryClient.invalidateQueries({ queryKey: ["venue", venueId] })
}

export async function addWalkInReservation(
  venueId: string,
  input: WalkInReservationInput
): Promise<Reservation> {
  const reservation = await api<Reservation>(
    `/api/venues/${venueId}/reservations/walk-in`,
    {
      method: "POST",
      body: input,
    }
  )
  void queryClient.invalidateQueries({ queryKey: ["venue", venueId] })
  return reservation
}

// ── Reservation status transitions ───────────────────────────────────────────
// One endpoint backs every status change; these are thin, intent-named wrappers
// the operator surfaces call (approve/decline reservations, check in an arrival,
// cancel a scheduled booking).

async function setReservationStatus(
  venueId: string,
  reservationId: string,
  status: ReservationStatus,
  reason?: string
): Promise<Reservation> {
  const reservation = await api<Reservation>(
    `/api/venues/${venueId}/reservations/${reservationId}/status`,
    { method: "PUT", body: { status, reason } }
  )
  void queryClient.invalidateQueries({ queryKey: ["venue", venueId] })
  return reservation
}

/**
 * Approve (→ confirmed) or decline (→ cancelled) a pending reservation. A
 * decline requires a reason, which flows back to the linked player's session
 * (cancelled + reason + refund) via the API.
 */
export async function decideReservation(
  venueId: string,
  reservationId: string,
  decision: "approved" | "declined",
  reason?: string
): Promise<Reservation> {
  return setReservationStatus(
    venueId,
    reservationId,
    decision === "approved" ? "confirmed" : "cancelled",
    decision === "declined" ? reason : undefined
  )
}

/**
 * Cancel a reservation (→ cancelled), e.g. from the schedule event popover.
 * The API requires a reason for any cancellation; it flows back to the
 * player as a refund notification.
 */
export async function cancelReservation(
  venueId: string,
  reservationId: string,
  reason: string
): Promise<Reservation> {
  return setReservationStatus(venueId, reservationId, "cancelled", reason)
}

export interface RescheduleReservationInput {
  dayKey: string
  start: string
  durationMin: number
}

/** Move a reservation to a new day/time on its own court. */
export async function rescheduleReservation(
  venueId: string,
  reservationId: string,
  input: RescheduleReservationInput
): Promise<Reservation> {
  const reservation = await api<Reservation>(
    `/api/venues/${venueId}/reservations/${reservationId}`,
    { method: "PUT", body: input }
  )
  void queryClient.invalidateQueries({ queryKey: ["venue", venueId] })
  return reservation
}

export interface CustomerInput {
  name: string
  phone: string
  favoriteSport: SportKey
}

/** Add a CRM customer to a venue (phone is the id; duplicates 409). */
export async function createCustomer(
  venueId: string,
  input: CustomerInput
): Promise<VenueCustomer> {
  const customer = await api<VenueCustomer>(
    `/api/venues/${venueId}/customers`,
    {
      method: "POST",
      body: input,
    }
  )
  void queryClient.invalidateQueries({ queryKey: ["venue", venueId] })
  return customer
}

// ── Court blocks (VienTD-Review decision #12) ────────────────────────────────
// A block always carries a required `reason` — never inferred — and is
// guarded server-side against a live (pending/confirmed/checked-in) booking on
// the same court/slot.

export interface CourtBlockInput {
  courtId: string
  dateKey: string
  start: string
  durationMin: number
  reason: CourtBlockReason
  note?: string
}

export async function addCourtBlock(
  venueId: string,
  input: CourtBlockInput
): Promise<CourtBlock> {
  const block = await api<CourtBlock>(`/api/venues/${venueId}/blocks`, {
    method: "POST",
    body: input,
  })
  void queryClient.invalidateQueries({ queryKey: ["venue", venueId] })
  return block
}

/** Reopen a blocked slot ("Mở lại khung giờ"). */
export async function removeCourtBlock(
  venueId: string,
  blockId: string
): Promise<void> {
  await api(`/api/venues/${venueId}/blocks/${blockId}`, { method: "DELETE" })
  void queryClient.invalidateQueries({ queryKey: ["venue", venueId] })
}
