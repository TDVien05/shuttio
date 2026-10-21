import { createFileRoute, redirect } from "@tanstack/react-router"

import { fetchForGuard } from "@/lib/route-guard"
import { venueQueries } from "@/features/venue/api/venue.queries"

/** `/app/venue` — open the account's first branch, or set one up. */
export const Route = createFileRoute("/_authenticated/app/venue/")({
  beforeLoad: async ({ context }) => {
    // fetchQuery honors staleTime, so a mutation's invalidation is refetched
    // here instead of redirecting on the cached copy.
    const venue = await fetchForGuard(
      context.queryClient,
      venueQueries.myVenue()
    )
    throw venue
      ? redirect({
          to: "/app/venue/$venueId",
          params: { venueId: venue.info.id },
          replace: true,
        })
      : redirect({ to: "/setup", replace: true })
  },
})
