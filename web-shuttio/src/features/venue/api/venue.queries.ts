import { queryOptions } from "@tanstack/react-query"
import { notFound } from "@tanstack/react-router"

import { ApiError, api } from "@/lib/api"
import type { BankAccount, BranchSummary, VenueSeed } from "@/lib/shared"

/** Reads owned by the venue-operator workspace. */
export const venueQueries = {
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
}
