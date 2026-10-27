import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { VenueScheduleWorkspace } from "@/features/venue/components/schedule-workspace"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authenticated/app/venue/$venueId/schedule"
)({
  validateSearch: z.object({
    tab: z.enum(["calendar", "reservations"]).optional(),
    day: z.string().optional(),
    new: z.boolean().optional(),
  }),
  head: () =>
    pageTitle(
      m.venue_schedule_meta_title(),
      m.venue_schedule_meta_description()
    ),
  component: SchedulePage,
})

function SchedulePage() {
  const { tab, day, new: openNew } = Route.useSearch()
  return (
    <VenueScheduleWorkspace
      initialTab={tab}
      initialDay={day}
      initialNew={openNew}
    />
  )
}
