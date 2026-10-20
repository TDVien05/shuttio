import { createFileRoute } from "@tanstack/react-router"

import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_signed-in/app/")({
  head: () =>
    pageTitle(m.court_finder_meta_title(), m.court_finder_meta_description()),
  // The AI assistant is ported in the AI phase.
  component: () => null,
})
