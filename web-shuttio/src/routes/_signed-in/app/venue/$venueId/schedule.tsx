import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { VenueScheduleWorkspace } from "@/features/venue/schedule-workspace"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_signed-in/app/venue/$venueId/schedule")(
  {
    validateSearch: z.object({
      tab: z.enum(["calendar", "reservations"]).optional(),
      day: z.string().optional(),
    }),
    head: () =>
      pageTitle(
        m.venue_schedule_meta_title(),
        m.venue_schedule_meta_description()
      ),
    component: SchedulePage,
  }
)

function SchedulePage() {
  const { tab, day } = Route.useSearch()
  return <VenueScheduleWorkspace initialTab={tab} initialDay={day} />
}
