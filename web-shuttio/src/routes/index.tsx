import { createFileRoute } from "@tanstack/react-router"

import { LandingPage } from "@/features/landing/components/landing-page"

// The only server-rendered route: prerendered to static HTML at build time.
export const Route = createFileRoute("/")({
  ssr: true,
  component: LandingPage,
})
