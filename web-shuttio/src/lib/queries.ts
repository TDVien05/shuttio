import { queryOptions } from "@tanstack/react-query"

import { ApiError, api } from "@/lib/api"
import type {
  AccountType,
  AppReviewsPublic,
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
