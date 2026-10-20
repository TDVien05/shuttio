import { createFileRoute } from "@tanstack/react-router"

// Replaced in the venue phase.
export const Route = createFileRoute("/_signed-in/app/venue/$venueId/courts")({
  component: () => null,
})
