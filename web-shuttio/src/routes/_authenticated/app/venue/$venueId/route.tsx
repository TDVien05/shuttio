import { Outlet, createFileRoute } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"

import {
  useVenueReservations,
  venueQueries,
} from "@/features/venue/api/venue.queries"

/**
 * Venue workspace layout. An account's brand may own many branches (chi
 * nhánh), so the active branch is the `$venueId` URL segment: the layout loads
 * that branch's bundle (the api authorizes ownership).
 *
 * The 10 s reservation poll lives here — one observer for the branch — so it
 * keeps running regardless of which venue page is open. Every page derives
 * its records from the same query cache through `useVenueData()`.
 */
export const Route = createFileRoute("/_authenticated/app/venue/$venueId")({
  component: VenueWorkspaceLayout,
})

function VenueWorkspaceLayout() {
  const { venueId } = Route.useParams()
  useSuspenseQuery(venueQueries.venueBundle(venueId))
  useVenueReservations(venueId)

  return <Outlet />
}
