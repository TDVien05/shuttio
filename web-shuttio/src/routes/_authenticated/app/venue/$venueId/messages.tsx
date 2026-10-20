import { createFileRoute } from "@tanstack/react-router"

import { ChatUnavailable } from "@/features/chat/components/chat-unavailable"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authenticated/app/venue/$venueId/messages"
)({
  head: () =>
    pageTitle(
      m.venue_messages_meta_title(),
      m.venue_messages_meta_description()
    ),
  component: ChatUnavailable,
})
