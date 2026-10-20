import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

// Replaced in the venue phase (the setup wizard is a venue feature).
export const Route = createFileRoute("/_signed-in/setup")({
  validateSearch: z.object({ branch: z.string().optional() }),
  component: () => null,
})
