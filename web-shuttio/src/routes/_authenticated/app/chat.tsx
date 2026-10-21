import { createFileRoute } from "@tanstack/react-router"

import { ChatView } from "@/features/chat/components/chat-view"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authenticated/app/chat")({
  validateSearch: (search: Record<string, unknown>): { channel?: string } => ({
    channel: typeof search.channel === "string" ? search.channel : undefined,
  }),
  head: () => pageTitle(m.chat_meta_title(), m.chat_meta_description()),
  component: ChatPage,
})

function ChatPage() {
  const { channel } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <ChatView
      selectedId={channel}
      onSelect={(id) =>
        void navigate({ search: { channel: id }, replace: true })
      }
    />
  )
}
