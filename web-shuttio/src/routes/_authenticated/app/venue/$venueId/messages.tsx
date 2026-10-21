import { createFileRoute } from "@tanstack/react-router"

import { ChatView } from "@/features/chat/components/chat-view"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authenticated/app/venue/$venueId/messages"
)({
  validateSearch: (search: Record<string, unknown>): { channel?: string } => ({
    channel: typeof search.channel === "string" ? search.channel : undefined,
  }),
  head: () =>
    pageTitle(
      m.venue_messages_meta_title(),
      m.venue_messages_meta_description()
    ),
  component: VenueMessagesPage,
})

function VenueMessagesPage() {
  const { venueId } = Route.useParams()
  const { channel } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <ChatView
      venueId={venueId}
      selectedId={channel}
      onSelect={(id) =>
        void navigate({ search: { channel: id }, replace: true })
      }
    />
  )
}
