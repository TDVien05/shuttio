import { Navigate, createFileRoute } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"

import { queries } from "@/lib/queries"

/** `/app/venue` — open the account's first branch, or set one up. */
export const Route = createFileRoute("/_signed-in/app/venue/")({
  component: VenueIndex,
})

function VenueIndex() {
  const { data: venue } = useSuspenseQuery(queries.myVenue())
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
