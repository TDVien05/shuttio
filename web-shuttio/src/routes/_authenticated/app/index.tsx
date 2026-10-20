import { createFileRoute } from "@tanstack/react-router"

import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"
import { AiNativeDashboardView } from "@/features/chat/components/ai-native-dashboard"

export const Route = createFileRoute("/_authenticated/app/")({
  head: () =>
    pageTitle(m.court_finder_meta_title(), m.court_finder_meta_description()),
  component: AiNativeDashboardView,
})
