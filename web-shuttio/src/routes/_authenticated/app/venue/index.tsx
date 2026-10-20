import { Navigate, createFileRoute } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"

import { venueQueries } from "@/features/venue/api/venue.queries"

/** `/app/venue` — open the account's first branch, or set one up. */
export const Route = createFileRoute("/_authenticated/app/venue/")({
  component: VenueIndex,
})

function VenueIndex() {
  const { data: venue } = useSuspenseQuery(venueQueries.myVenue())
  return venue ? (
    <Navigate
      to="/app/venue/$venueId"
      params={{ venueId: venue.info.id }}
      replace
    />
  ) : (
    <Navigate to="/setup" replace />
  )
}
