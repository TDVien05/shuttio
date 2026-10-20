import { MessageSquareOff } from "lucide-react"

import { m } from "@/paraglide/messages"

/** Messaging isn't available in this app yet — the chat screens show this. */
export function ChatUnavailable() {
  return (
    <div className="grid h-full min-h-vh-60 place-items-center p-6 text-center">
      <div className="flex max-w-xs flex-col items-center gap-3">
        <MessageSquareOff className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{m.chat_unavailable()}</p>
      </div>
    </div>
  )
}
