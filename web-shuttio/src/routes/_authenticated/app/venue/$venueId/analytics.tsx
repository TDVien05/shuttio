import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { VenueInsightsWorkspace } from "@/features/venue/components/insights-workspace"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authenticated/app/venue/$venueId/analytics"
)({
  validateSearch: z.object({
    tab: z.enum(["performance", "players"]).optional(),
  }),
  head: () =>
    pageTitle(
      m.venue_insights_meta_title(),
      m.venue_insights_meta_description()
    ),
  component: InsightsPage,
})

function InsightsPage() {
  const { tab } = Route.useSearch()
  return <VenueInsightsWorkspace initialTab={tab} />
}
