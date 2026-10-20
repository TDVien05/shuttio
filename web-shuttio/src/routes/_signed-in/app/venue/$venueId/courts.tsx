import { createFileRoute } from "@tanstack/react-router"

import { VenueCourtsView } from "@/features/venue/courts"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_signed-in/app/venue/$venueId/courts")({
  head: () =>
    pageTitle(m.venue_courts_meta_title(), m.venue_courts_meta_description()),
  component: VenueCourtsView,
})
