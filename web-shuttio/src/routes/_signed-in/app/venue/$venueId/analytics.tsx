import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

// Replaced in the venue phase.
export const Route = createFileRoute(
  "/_signed-in/app/venue/$venueId/analytics"
)({
  validateSearch: z.object({ tab: z.string().optional() }),
  component: () => null,
})
