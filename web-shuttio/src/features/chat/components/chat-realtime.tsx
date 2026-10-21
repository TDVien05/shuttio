import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"

import type { ChatEvent } from "@/lib/shared"
import { useAuthUser } from "@/features/dashboard/hooks/use-auth-user"
import {
  appendMessage,
  chatQueries,
} from "@/features/chat/lib/chat-queries"
import type { MessagePages } from "@/features/chat/lib/chat-queries"
import { subscribeToChannel, userChatChannel } from "@/lib/realtime"
import { queryKeys } from "@/lib/query-keys"

/**
 * Keeps the chat caches live for the whole dashboard (so unread badges move
 * wherever the user is): a new message lands in its conversation's cache and
 * refreshes the list; any other change just refetches the list. Renders
 * nothing.
 */
export function ChatRealtime() {
  const queryClient = useQueryClient()
  const { id: userId } = useAuthUser()

  React.useEffect(() => {
    const refetchChannels = () =>
      void queryClient.invalidateQueries({
        queryKey: queryKeys.chat.channelsAll(),
      })
    return subscribeToChannel(
      userChatChannel(userId),
      (data) => {
        const event = data as ChatEvent
        if (event.type === "message") {
          queryClient.setQueryData<MessagePages>(
            chatQueries.messages(event.channelId).queryKey,
            (prev) => appendMessage(prev, event.message)
          )
        }
        refetchChannels()
      },
      // (Re)connected: cover anything published while offline.
      () => {
        refetchChannels()
        void queryClient.invalidateQueries({
          queryKey: queryKeys.chat.messagesAll(),
        })
      }
    )
  }, [queryClient, userId])

  return null
}
