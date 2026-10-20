import { Outlet, createFileRoute } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"

import { VenueDataProvider } from "@/features/venue/components/venue-data-provider"
import { VenueWorkspaceProvider } from "@/features/venue/components/venue-provider"
import { venueQueries } from "@/features/venue/api/venue.queries"

/**
 * Venue workspace layout. An account's brand may own many branches (chi
 * nhánh), so the active branch is the `$venueId` URL segment: the layout loads
 * that branch's bundle (the api authorizes ownership) and seeds the provider.
 */
export const Route = createFileRoute("/_authenticated/app/venue/$venueId")({
  component: VenueWorkspaceLayout,
})

function VenueWorkspaceLayout() {
  const { venueId } = Route.useParams()
  const { data: seed } = useSuspenseQuery(venueQueries.venueBundle(venueId))

  return (
    // Keyed by branch so switching branches starts from that branch's seed.
    <VenueDataProvider key={venueId} seed={seed} venueId={seed.info.id}>
      <VenueWorkspaceProvider>
        <Outlet />
      </VenueWorkspaceProvider>
    </VenueDataProvider>
  )
}
