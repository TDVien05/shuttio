import { createFileRoute } from "@tanstack/react-router"

import { LandingPage } from "@/features/landing/components/landing-page"

// The only server-rendered route: the root route's `ssr` gate enables SSR for
// `/`, and the build prerenders it to `index.html`.
export const Route = createFileRoute("/")({
  component: LandingPage,
})
