import { queryOptions } from "@tanstack/react-query"
import { notFound } from "@tanstack/react-router"

import { ApiError, api } from "@/lib/api"
import type {
  AccountType,
  AppReviewsPublic,
  BankAccount,
  BranchSummary,
  PlayerAssessment,
  Seed,
  VenueSeed,
} from "@/lib/shared"

/**
 * Query options for every api read, keyed by resource. Components call
 * `useQuery(…)`/`useSuspenseQuery(…)` with these and mutations invalidate by
 * the same keys, so a write anywhere refreshes every screen showing the data.
 */
export const queries = {
  /**
   * The signed-in player's aggregate dashboard payload (`GET /api/seed`) —
   * every `/app` screen reads it through `useData()`.
   */
  seed: () =>
    queryOptions({
      queryKey: ["seed"],
      queryFn: ({ signal }) => api<Seed>("/api/seed", { signal }),
    }),

  /** The signed-in account's effective account type (null until chosen). */
  accountType: () =>
    queryOptions({
      queryKey: ["account"],
      queryFn: async ({ signal }) =>
        (
          await api<{ accountType: AccountType | null }>("/api/account", {
            signal,
          })
        ).accountType,
    }),

  /** The signed-in player's persisted skills assessment (null until taken). */
  assessment: () =>
    queryOptions({
      queryKey: ["assessment"],
      queryFn: ({ signal }) =>
        api<PlayerAssessment | null>("/api/assessment", { signal }),
    }),

  /**
   * The account's default (first) branch bundle, or null when it has
   * provisioned none yet (404) — the "has a venue" signal.
   */
  myVenue: () =>
    queryOptions({
      queryKey: ["venue", "mine"],
      queryFn: async ({ signal }) => {
        try {
          return await api<VenueSeed>("/api/venue/bundle", { signal })
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) return null
          throw err
        }
      },
    }),

  /**
   * One branch's full venue-operator bundle (`/app/venue/$venueId`). The api
   * authorizes the caller owns it — a 404/403 surfaces as not-found.
   */
  venueBundle: (venueId: string) =>
    queryOptions({
      queryKey: ["venue", venueId],
      queryFn: async ({ signal }) => {
        try {
          return await api<VenueSeed>(`/api/venue/${venueId}/bundle`, {
            signal,
          })
        } catch (err) {
          if (err instanceof ApiError && [403, 404].includes(err.status)) {
            throw notFound()
          }
          throw err
        }
      },
    }),

  /** Every branch the account owns, each with a court-status rollup. */
  branchesSummary: () =>
    queryOptions({
      queryKey: ["venue", "branches"],
      queryFn: ({ signal }) =>
        api<BranchSummary[]>("/api/venue/branches/summary", { signal }),
    }),

  /** The owner's saved payout account (null while none is set). */
  payout: () =>
    queryOptions({
      queryKey: ["venue", "payout"],
      queryFn: async ({ signal }) =>
        (
          await api<{ payout: BankAccount | null }>("/api/brands/me/payout", {
            signal,
          })
        ).payout,
    }),

  /** The landing page's app-review summary (anonymous, `@Public()` route). */
  appReviewsPublic: () =>
    queryOptions({
      queryKey: ["app-reviews", "public"],
      queryFn: ({ signal }) =>
        api<AppReviewsPublic>("/api/app-reviews/public", {
          anonymous: true,
          signal,
        }),
      staleTime: 5 * 60_000,
    }),
}
