import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query"
import type { InfiniteData } from "@tanstack/react-query"

import { queryKeys } from "@/lib/query-keys"
import type { ChatChannel, ChatMessage } from "@/lib/shared"
import { listChannels, listMessages } from "@/features/chat/api/chat-api"

/** One conversation's pages, newest page first (`pages[0]` is the latest). */
export type MessagePages = InfiniteData<{
  messages: ChatMessage[]
  hasMore: boolean
}>

export const chatQueries = {
  /** `venueId` narrows to a venue's operator inbox. */
  channels: (venueId?: string) =>
    queryOptions({
      queryKey: queryKeys.chat.channels(venueId),
      queryFn: () => listChannels(venueId),
      staleTime: 30_000,
    }),
  messages: (channelId: string) =>
    infiniteQueryOptions({
      queryKey: queryKeys.chat.messages(channelId),
      queryFn: ({ pageParam }) => listMessages(channelId, pageParam),
      initialPageParam: undefined as string | undefined,
      // The next (older) page ends before this page's oldest message.
      getNextPageParam: (last) =>
        last.hasMore ? last.messages[0]?.id : undefined,
    }),
}

/** Every message of a conversation's cached pages, oldest → newest. */
export function flattenMessages(data: MessagePages | undefined): ChatMessage[] {
  if (!data) return []
  return [...data.pages].reverse().flatMap((p) => p.messages)
}

/** Add `message` to the newest cached page, unless it's already there. */
export function appendMessage(
  data: MessagePages | undefined,
  message: ChatMessage
): MessagePages | undefined {
  if (!data?.pages.length) return data
  if (data.pages.some((p) => p.messages.some((m) => m.id === message.id))) {
    return data
  }
  const [latest, ...older] = data.pages
  return {
    ...data,
    pages: [{ ...latest, messages: [...latest.messages, message] }, ...older],
  }
}

/** Replace a temporary client message by its tempId or append the message. */
export function replaceOrAppendMessage(
  data: MessagePages | undefined,
  message: ChatMessage,
  tempId?: string
): MessagePages | undefined {
  if (!data?.pages.length) return data
  const [latest, ...older] = data.pages
  if (latest.messages.some((m) => m.id === message.id)) return data

  const replaceIndex = tempId
    ? latest.messages.findIndex((m) => m.id === tempId)
    : -1

  const messages =
    replaceIndex >= 0
      ? latest.messages.map((m, idx) => (idx === replaceIndex ? message : m))
      : [...latest.messages, message]

  return {
    ...data,
    pages: [
      {
        ...latest,
        messages,
      },
      ...older,
    ],
  }
}

/** Remove a message from the cache (e.g. failed optimistic message). */
export function removeMessage(
  data: MessagePages | undefined,
  messageId: string
): MessagePages | undefined {
  if (!data?.pages.length) return data
  return {
    ...data,
    pages: data.pages.map((p) => ({
      ...p,
      messages: p.messages.filter((m) => m.id !== messageId),
    })),
  }
}

/** Total unread across a channel list. */
export const totalUnread = (channels: ChatChannel[] | undefined) =>
  channels?.reduce((sum, c) => sum + c.unread, 0) ?? 0
