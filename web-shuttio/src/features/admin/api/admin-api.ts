import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { QueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"
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

/**
 * Result-object shape for the venue actions whose failure message matters to
 * the admin (e.g. "còn lượt đặt tương lai").
 */
export type AdminActionResult = { ok: true } | { ok: false; message: string }

function createAdminActions(queryClient: QueryClient) {
  const invalidateAdmin = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.all() })
  }

  const toResult = async (
    run: () => Promise<unknown>
  ): Promise<AdminActionResult> => {
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

  return {
    approveBrand: async (brandId: string): Promise<void> => {
      await api(`/api/admin/brands/${brandId}/approve`, { method: "POST" })
      invalidateAdmin()
    },

    rejectBrand: async (brandId: string, reason: string): Promise<void> => {
      await api(`/api/admin/brands/${brandId}/reject`, {
        method: "POST",
        body: { reason },
      })
      invalidateAdmin()
    },

    suspendVenue: (venueId: string): Promise<AdminActionResult> =>
      toResult(() =>
        api(`/api/admin/venues/${venueId}/suspend`, { method: "POST" })
      ),

    restoreVenue: (venueId: string): Promise<AdminActionResult> =>
      toResult(() =>
        api(`/api/admin/venues/${venueId}/restore`, { method: "POST" })
      ),

    /** Create a venue account; the API emails the generated password. */
    createVenueAccount: (input: {
      email: string
      name?: string
    }): Promise<AdminActionResult> =>
      toResult(() =>
        api("/api/admin/owners", { method: "POST", body: input })
      ),

    /** Delete a venue owner's account with all their brands, venues and data. */
    removeVenueOwner: (ownerId: string): Promise<AdminActionResult> =>
      toResult(() =>
        api(`/api/admin/owners/${encodeURIComponent(ownerId)}`, {
          method: "DELETE",
        })
      ),

    settleRefund: async (bookingId: string, ref: string): Promise<void> => {
      await api(`/api/admin/refunds/${bookingId}/settle`, {
        method: "POST",
        body: { ref },
      })
      invalidateAdmin()
    },

    forceCancelBooking: async (
      bookingId: string,
      reason: string
    ): Promise<AdminBookingRow> => {
      const booking = await api<AdminBookingRow>(
        `/api/admin/bookings/${bookingId}/cancel`,
        { method: "POST", body: { reason } }
      )
      invalidateAdmin()
      return booking
    },

    createDiscount: async (
      input: AdminDiscountInput
    ): Promise<AdminDiscountRow> => {
      const discount = await api<AdminDiscountRow>("/api/admin/discounts", {
        method: "POST",
        body: input,
      })
      invalidateAdmin()
      return discount
    },

    updateDiscount: async (
      code: string,
      patch: Partial<AdminDiscountInput>
    ): Promise<AdminDiscountRow> => {
      const discount = await api<AdminDiscountRow>(
        `/api/admin/discounts/${code}`,
        {
          method: "PATCH",
          body: patch,
        }
      )
      invalidateAdmin()
      return discount
    },

    deleteDiscount: async (code: string): Promise<void> => {
      await api(`/api/admin/discounts/${code}`, { method: "DELETE" })
      invalidateAdmin()
    },

    /**
     * Hide or re-show a user's app review. Also revalidates the landing page,
     * whose testimonials quote these reviews.
     */
    setAppReviewHidden: async (
      userId: string,
      hidden: boolean
    ): Promise<void> => {
      const action = hidden ? "hide" : "show"
      await api(
        `/api/admin/app-reviews/${encodeURIComponent(userId)}/${action}`,
        { method: "POST" }
      )
      invalidateAdmin()
      void queryClient.invalidateQueries({
        queryKey: queryKeys.appReviews(),
      })
    },

    /** Hard-delete a venue; cancels all live bookings and notifies affected players. */
    deleteVenue: (venueId: string): Promise<AdminActionResult> =>
      toResult(() => api(`/api/admin/venues/${venueId}`, { method: "DELETE" })),

    /** Settle a room-share complaint: refund the member's share or dismiss it. */
    resolveComplaint: async (
      id: string,
      decision: "resolve" | "dismiss",
      note: string
    ): Promise<RoomComplaintRow> => {
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
    },
  }
}

/** Admin write actions bound to the request's React Query client. */
export function useAdminActions() {
  const queryClient = useQueryClient()
  return React.useMemo(() => createAdminActions(queryClient), [queryClient])
}
