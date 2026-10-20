import { queryOptions } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { AdminAppReviewRow, RoomComplaintRow } from "@/lib/shared"
import type {
  AdminApprovalRow,
  AdminBookingRow,
  AdminBrandGroup,
  AdminDiscountRow,
  AdminOverview,
  AdminRefundRow,
} from "@/features/admin/types/admin-types"

/** Reads owned by the cross-tenant admin workspace. */
export const adminQueries = {
  /** `GET /api/admin/overview` — system-wide KPIs. */
  adminOverview: () =>
    queryOptions({
      queryKey: ["admin", "overview"],
      queryFn: ({ signal }) =>
        api<AdminOverview>("/api/admin/overview", { signal }),
    }),

  /** `GET /api/admin/venues` — every brand and its branches. */
  adminVenues: () =>
    queryOptions({
      queryKey: ["admin", "venues"],
      queryFn: ({ signal }) =>
        api<AdminBrandGroup[]>("/api/admin/venues", { signal }),
    }),

  /** `GET /api/admin/bookings` — cross-tenant recent bookings. */
  adminBookings: () =>
    queryOptions({
      queryKey: ["admin", "bookings"],
      queryFn: ({ signal }) =>
        api<AdminBookingRow[]>("/api/admin/bookings", { signal }),
    }),

  /** `GET /api/admin/refunds` — global manual-refund worklist. */
  adminRefunds: () =>
    queryOptions({
      queryKey: ["admin", "refunds"],
      queryFn: ({ signal }) =>
        api<AdminRefundRow[]>("/api/admin/refunds", { signal }),
    }),

  /** `GET /api/admin/complaints` — room-share complaints. */
  adminComplaints: () =>
    queryOptions({
      queryKey: ["admin", "complaints"],
      queryFn: ({ signal }) =>
        api<RoomComplaintRow[]>("/api/admin/complaints", { signal }),
    }),

  /** `GET /api/admin/approvals` — pending brand approvals. */
  adminApprovals: () =>
    queryOptions({
      queryKey: ["admin", "approvals"],
      queryFn: ({ signal }) =>
        api<AdminApprovalRow[]>("/api/admin/approvals", { signal }),
    }),

  /** `GET /api/admin/discounts` — coupon list. */
  adminDiscounts: () =>
    queryOptions({
      queryKey: ["admin", "discounts"],
      queryFn: ({ signal }) =>
        api<AdminDiscountRow[]>("/api/admin/discounts", { signal }),
    }),

  /** `GET /api/admin/app-reviews` — app reviews moderation. */
  adminAppReviews: () =>
    queryOptions({
      queryKey: ["admin", "app-reviews"],
      queryFn: ({ signal }) =>
        api<AdminAppReviewRow[]>("/api/admin/app-reviews", { signal }),
    }),
}
