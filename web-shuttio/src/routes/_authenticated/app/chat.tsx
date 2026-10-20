import { createFileRoute } from "@tanstack/react-router"

import { ChatUnavailable } from "@/features/chat/components/chat-unavailable"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authenticated/app/chat")({
  head: () => pageTitle(m.chat_meta_title(), m.chat_meta_description()),
  component: ChatUnavailable,
})
