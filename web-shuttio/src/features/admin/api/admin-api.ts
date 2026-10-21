import { api } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"
import { queryClient } from "@/lib/query-client"
import type { RoomComplaintRow } from "@/lib/shared"
import type {
  AdminBookingRow,
  AdminDiscountInput,
  AdminDiscountRow,
} from "@/features/admin/types/admin-types"

// Client calls for the admin workspace's role-gated `/api/admin/*` routes.
// Every write invalidates the `["admin"]` queries so open screens refetch.
// `api` (lib/api.ts) attaches the Clerk bearer token and throws an `ApiError`
// carrying the API's message, so callers can just `catch` it.

function invalidateAdmin() {
  void queryClient.invalidateQueries({ queryKey: queryKeys.admin.all() })
}

export async function approveBrand(brandId: string): Promise<void> {
  await api(`/api/admin/brands/${brandId}/approve`, { method: "POST" })
  invalidateAdmin()
}

export async function rejectBrand(
  brandId: string,
  reason: string
): Promise<void> {
  await api(`/api/admin/brands/${brandId}/reject`, {
    method: "POST",
    body: { reason },
  })
  invalidateAdmin()
}

/**
 * Result-object shape for the venue actions whose failure message matters to
 * the admin (e.g. "còn lượt đặt tương lai").
 */
export type AdminActionResult = { ok: true } | { ok: false; message: string }

async function toResult(
  run: () => Promise<unknown>
): Promise<AdminActionResult> {
  try {
    await run()
    invalidateAdmin()
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Request failed",
    }
  }
}

export async function suspendVenue(
  venueId: string
): Promise<AdminActionResult> {
  return toResult(() =>
    api(`/api/admin/venues/${venueId}/suspend`, { method: "POST" })
  )
}

export async function restoreVenue(
  venueId: string
): Promise<AdminActionResult> {
  return toResult(() =>
    api(`/api/admin/venues/${venueId}/restore`, { method: "POST" })
  )
}

/** Delete a venue owner's account with all their brands, venues and data. */
export async function removeVenueOwner(
  ownerId: string
): Promise<AdminActionResult> {
  return toResult(() =>
    api(`/api/admin/owners/${encodeURIComponent(ownerId)}`, {
      method: "DELETE",
    })
  )
}

export async function settleRefund(
  bookingId: string,
  ref: string
): Promise<void> {
  await api(`/api/admin/refunds/${bookingId}/settle`, {
    method: "POST",
    body: { ref },
  })
  invalidateAdmin()
}

export async function forceCancelBooking(
  bookingId: string,
  reason: string
): Promise<AdminBookingRow> {
  const booking = await api<AdminBookingRow>(
    `/api/admin/bookings/${bookingId}/cancel`,
    { method: "POST", body: { reason } }
  )
  invalidateAdmin()
  return booking
}

export async function createDiscount(
  input: AdminDiscountInput
): Promise<AdminDiscountRow> {
  const discount = await api<AdminDiscountRow>("/api/admin/discounts", {
    method: "POST",
    body: input,
  })
  invalidateAdmin()
  return discount
}

export async function updateDiscount(
  code: string,
  patch: Partial<AdminDiscountInput>
): Promise<AdminDiscountRow> {
  const discount = await api<AdminDiscountRow>(`/api/admin/discounts/${code}`, {
    method: "PATCH",
    body: patch,
  })
  invalidateAdmin()
  return discount
}

export async function deleteDiscount(code: string): Promise<void> {
  await api(`/api/admin/discounts/${code}`, { method: "DELETE" })
  invalidateAdmin()
}

/**
 * Hide or re-show a user's app review. Also revalidates the landing page,
 * whose testimonials quote these reviews.
 */
export async function setAppReviewHidden(
  userId: string,
  hidden: boolean
): Promise<void> {
  const action = hidden ? "hide" : "show"
  await api(`/api/admin/app-reviews/${encodeURIComponent(userId)}/${action}`, {
    method: "POST",
  })
  invalidateAdmin()
  void queryClient.invalidateQueries({
    queryKey: queryKeys.appReviews(),
  })
}

/** Hard-delete a venue; cancels all live bookings and notifies affected players. */
export async function deleteVenue(venueId: string): Promise<AdminActionResult> {
  return toResult(() =>
    api(`/api/admin/venues/${venueId}`, { method: "DELETE" })
  )
}

/** Settle a room-share complaint: refund the member's share or dismiss it. */
export async function resolveComplaint(
  id: string,
  decision: "resolve" | "dismiss",
  note: string
): Promise<RoomComplaintRow> {
  const row = await api<RoomComplaintRow>(
    `/api/admin/complaints/${encodeURIComponent(id)}/resolve`,
    {
      method: "POST",
      body: {
        decision,
        ...(note.trim() ? { note: note.trim() } : {}),
      },
    }
  )
  invalidateAdmin()
  return row
}
