import { createFileRoute } from "@tanstack/react-router"

import { VenueCommandView } from "@/features/venue/command"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_signed-in/app/venue/$venueId/")({
  head: () =>
    pageTitle(m.venue_command_meta_title(), m.venue_command_meta_description()),
  component: VenueCommandView,
})
