import * as React from "react"
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Info,
  MessageSquarePlus,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuthUser } from "@/features/dashboard/hooks/use-auth-user"
import {
  leaveConversation,
  markChannelRead,
} from "@/features/chat/api/chat-api"
import { Composer } from "@/features/chat/components/composer"
import { GroupInfoDialog } from "@/features/chat/components/group-info-dialog"
import { MessageList } from "@/features/chat/components/message-list"
import { NewChatDialog } from "@/features/chat/components/new-chat-dialog"
import { UserAvatar } from "@/features/chat/components/user-avatar"
import {
  PresenceDot,
  presenceText,
  usePresence,
} from "@/features/presence/presence"
import {
  appendMessage,
  chatQueries,
  flattenMessages,
  removeMessage,
  replaceOrAppendMessage,
} from "@/features/chat/lib/chat-queries"
import type { MessagePages } from "@/features/chat/lib/chat-queries"
import {
  channelAvatarUser,
  channelTitle,
  matchesQuery,
  previewText,
} from "@/features/chat/lib/chat-utils"
import { relativeTime } from "@/lib/relative-time"
import { cn } from "@/lib/utils"
import type { ChatChannel, ChatMessage } from "@/lib/shared"
import { m } from "@/paraglide/messages"

/**
 * Two-pane chat: conversation list + the open conversation (one pane at a time
 * on a phone). `selectedId` lives in the URL. With `venueId`, it's that venue's
 * operator inbox.
 */
export function ChatView({
  selectedId,
  onSelect,
  venueId,
}: {
  selectedId: string | undefined
  onSelect: (channelId: string | undefined) => void
  venueId?: string
}) {
  const { id: userId } = useAuthUser()
  const { data: channels, isError } = useQuery(chatQueries.channels(venueId))
  const [filter, setFilter] = React.useState("")
  const [newChatOpen, setNewChatOpen] = React.useState(false)

  // Presence of the other person in each one-to-one conversation (groups
  // show it per member, in the group's info dialog).
  const presence = usePresence(
    (channels ?? []).flatMap((c) =>
      c.kind === "dm" ? (channelAvatarUser(c, userId)?.id ?? []) : []
    )
  )

  const selected = channels?.find((c) => c.id === selectedId)
  const shown = channels?.filter((c) =>
    matchesQuery(channelTitle(c, userId), filter)
  )

  return (
    <div className="flex h-full min-h-0 bg-background">
      <aside
        className={cn(
          "flex min-h-0 w-full flex-col border-r md:w-80 lg:w-96",
          selectedId && "hidden md:flex"
        )}
      >
        <div className="flex items-center gap-2 p-3">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={m.chat_list_search_placeholder()}
            aria-label={m.chat_list_search_placeholder()}
          />
          {!venueId && (
            <Button
              size="icon"
              shape="pill"
              aria-label={m.chat_new_chat()}
              onPress={() => setNewChatOpen(true)}
            >
              <MessageSquarePlus />
            </Button>
          )}
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {!channels && !isError && (
            <li className="flex flex-col gap-2 p-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </li>
          )}
          {isError && (
            <li className="p-4 text-sm text-muted-foreground">
              {m.chat_list_failed()}
            </li>
          )}
          {shown?.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground">
              {m.chat_list_no_results()}
            </li>
          )}
          {shown?.map((c) => {
            const title = channelTitle(c, userId)
            const avatarUser = channelAvatarUser(c, userId)
            return (
              <li key={c.id}>
                <button
                  type="button"
                  aria-current={c.id === selectedId ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-muted/60 focus-visible:bg-muted",
                    c.id === selectedId && "bg-muted"
                  )}
                  onClick={() => onSelect(c.id)}
                >
                  <span className="relative shrink-0">
                    <UserAvatar
                      name={avatarUser?.name ?? title}
                      image={avatarUser?.image}
                    />
                    {c.kind === "dm" && avatarUser ? (
                      <PresenceDot
                        status={presence.get(avatarUser.id)}
                        className="border-background"
                      />
                    ) : null}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col text-left">
                    <span className="flex items-baseline justify-between gap-2">
                      <span
                        className={cn(
                          "truncate",
                          c.unread > 0 ? "font-semibold" : "font-medium"
                        )}
                      >
                        {title}
                      </span>
                      <span className="shrink-0 text-mini font-normal text-muted-foreground">
                        {c.lastMessage
                          ? relativeTime(new Date(c.lastMessage.createdAt))
                          : ""}
                      </span>
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1 truncate text-xs font-normal text-muted-foreground">
                        <LastMessageStatusIcon
                          channel={c}
                          currentUserId={userId}
                        />
                        <span className="truncate">
                          {previewText(c, userId)}
                        </span>
                      </span>
                      {c.unread > 0 && (
                        <span
                          className="shrink-0 rounded-full bg-electric px-1.5 text-mini font-semibold text-white"
                          aria-label={m.chat_unread_aria({ count: c.unread })}
                        >
                          {c.unread > 98 ? "99+" : c.unread}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      <section
        className={cn(
          "min-w-0 flex-1 flex-col",
          selectedId ? "flex" : "hidden md:flex"
        )}
      >
        {selected ? (
          <Conversation
            key={selected.id}
            channel={selected}
            userId={userId}
            onBack={() => onSelect(undefined)}
          />
        ) : (
          <div className="m-auto flex max-w-xs flex-col gap-1 p-6 text-center">
            <p className="font-medium">
              {venueId ? m.chat_empty_title() : m.chat_player_empty_title()}
            </p>
            <p className="text-sm text-muted-foreground">
              {venueId ? m.chat_empty_hint() : m.chat_player_empty_hint()}
            </p>
          </div>
        )}
      </section>

      <NewChatDialog
        open={newChatOpen}
        onOpenChange={setNewChatOpen}
        onCreated={onSelect}
      />
    </div>
  )
}

function LastMessageStatusIcon({
  channel,
  currentUserId,
}: {
  channel: ChatChannel
  currentUserId: string
}) {
  if (!channel.lastMessage || channel.lastMessage.senderId !== currentUserId) {
    return null
  }
  const lastTime = new Date(channel.lastMessage.createdAt).getTime()
  const otherMembers = channel.members.filter((m) => m.id !== currentUserId)
  if (!otherMembers.length) return null

  const isSeen = otherMembers.some((m) => {
    const readAt = channel.memberReadAt?.[m.id]
    return readAt ? new Date(readAt).getTime() >= lastTime : false
  })
  if (isSeen) {
    return <CheckCheck className="size-3 shrink-0 text-brand" />
  }

  const isDelivered = otherMembers.some((m) => {
    const deliveredAt = channel.memberDeliveredAt?.[m.id]
    return deliveredAt ? new Date(deliveredAt).getTime() >= lastTime : false
  })
  if (isDelivered) {
    return <CheckCheck className="size-3 shrink-0 text-muted-foreground/70" />
  }

  return <Check className="size-3 shrink-0 text-muted-foreground/70" />
}

function Conversation({
  channel,
  userId,
  onBack,
}: {
  channel: ChatChannel
  userId: string
  onBack: () => void
}) {
  const queryClient = useQueryClient()
  const [infoOpen, setInfoOpen] = React.useState(false)
  const history = useInfiniteQuery(chatQueries.messages(channel.id))
  const messages = flattenMessages(history.data)
  const lastId = messages.at(-1)?.id

  // Whatever is on screen is read; the api tells our other tabs via realtime.
  React.useEffect(() => {
    if (channel.unread > 0 && document.visibilityState === "visible") {
      void markChannelRead(channel.id)
    }
  }, [channel.id, channel.unread, lastId])

  const afterSend = (message: ChatMessage, tempId?: string) => {
    queryClient.setQueryData<MessagePages>(
      chatQueries.messages(channel.id).queryKey,
      (prev) => replaceOrAppendMessage(prev, message, tempId)
    )
    void queryClient.invalidateQueries({
      queryKey: queryKeys.chat.channelsAll(),
    })
  }

  const onOptimistic = (message: ChatMessage) => {
    queryClient.setQueryData<MessagePages>(
      chatQueries.messages(channel.id).queryKey,
      (prev) => appendMessage(prev, message)
    )
  }

  const onFailed = (tempId: string) => {
    queryClient.setQueryData<MessagePages>(
      chatQueries.messages(channel.id).queryKey,
      (prev) => removeMessage(prev, tempId)
    )
  }

  // DMs and venue threads: "delete" only removes it for the caller.
  const hide = useMutation({
    mutationFn: () => leaveConversation(channel.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.chat.all() })
      onBack()
    },
    onError: () => toast.error(m.chat_remove_failed()),
  })

  const title = channelTitle(channel, userId)
  const avatarUser = channelAvatarUser(channel, userId)
  const isGroupLike = channel.kind === "group" || channel.kind === "room"
  // Same ids as the list's query when this is the only DM; otherwise its own
  // small query — either way re-read every 30 seconds while the chat is open.
  const peerId = channel.kind === "dm" ? avatarUser?.id : undefined
  const peerPresence = usePresence(peerId ? [peerId] : []).get(peerId ?? "")
  const peerPresenceText = presenceText(peerPresence)

  return (
    <>
      <header className="flex items-center gap-3 border-b px-3 py-2">
        <Button
          size="icon"
          variant="ghost"
          shape="pill"
          className="md:hidden"
          aria-label={m.chat_back_to_chats()}
          onPress={onBack}
        >
          <ArrowLeft />
        </Button>
        <span className="relative shrink-0">
          <UserAvatar
            name={avatarUser?.name ?? title}
            image={avatarUser?.image}
          />
          <PresenceDot status={peerPresence} className="border-background" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-medium">{title}</h2>
          {peerPresenceText ? (
            <p className="text-xs text-muted-foreground">{peerPresenceText}</p>
          ) : null}
          {isGroupLike && (
            <p className="text-xs text-muted-foreground">
              {m.chat_members({ count: channel.members.length })}
            </p>
          )}
        </div>
        {isGroupLike ? (
          <Button
            size="icon"
            variant="ghost"
            shape="pill"
            aria-label={m.chat_group_info()}
            onPress={() => setInfoOpen(true)}
          >
            <Info />
          </Button>
        ) : (
          <AlertDialogTrigger>
            <Button
              size="icon"
              variant="danger"
              shape="pill"
              aria-label={m.chat_delete_dm()}
            >
              <Trash2 />
            </Button>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{m.chat_delete_dm_title()}</AlertDialogTitle>
                <AlertDialogDescription>
                  {m.chat_delete_dm_description({ name: title })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{m.chat_cancel()}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onPress={() => hide.mutate()}
                >
                  {hide.isPending ? m.chat_deleting() : m.chat_delete_dm()}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialogTrigger>
        )}
      </header>

      {history.isError ? (
        <p className="m-auto text-sm text-muted-foreground">
          {m.chat_messages_failed()}
        </p>
      ) : (
        <MessageList
          channel={channel}
          userId={userId}
          messages={messages}
          hasOlder={history.hasNextPage}
          loadingOlder={history.isFetchingNextPage}
          onLoadOlder={() => void history.fetchNextPage()}
        />
      )}

      {channel.frozen ? (
        <p className="border-t p-3 text-center text-sm text-muted-foreground">
          {m.chat_frozen_notice()}
        </p>
      ) : (
        <Composer
          channelId={channel.id}
          onSent={afterSend}
          onOptimistic={onOptimistic}
          onFailed={onFailed}
        />
      )}

      {isGroupLike && (
        <GroupInfoDialog
          channel={channel}
          userId={userId}
          open={infoOpen}
          onOpenChange={setInfoOpen}
          onGone={onBack}
        />
      )}
    </>
  )
}
