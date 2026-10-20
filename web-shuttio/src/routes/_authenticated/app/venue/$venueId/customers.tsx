import { createFileRoute } from "@tanstack/react-router"

import { VenueCustomersView } from "@/features/venue/components/customers"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authenticated/app/venue/$venueId/customers"
)({
  head: () =>
    pageTitle(
      m.venue_customers_meta_title(),
      m.venue_customers_meta_description()
    ),
  component: VenueCustomersView,
})
