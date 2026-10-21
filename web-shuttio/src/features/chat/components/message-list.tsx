import * as React from "react"
import { Check, CheckCheck, Clock } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { UserAvatar } from "@/features/chat/components/user-avatar"
import { getMessageStatus } from "@/features/chat/lib/chat-utils"
import { cn } from "@/lib/utils"
import type { ChatChannel, ChatMessage } from "@/lib/shared"
import { getLocale } from "@/paraglide/runtime"
import { m } from "@/paraglide/messages"

const timeFormat = () =>
  new Intl.DateTimeFormat(getLocale(), { hour: "2-digit", minute: "2-digit" })
const dayFormat = () =>
  new Intl.DateTimeFormat(getLocale(), { dateStyle: "full" })

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/**
 * A conversation's messages, oldest → newest, scrolled to the latest. Loading
 * an older page keeps the reader where they were; a new message only pulls the
 * view down when they were already at the bottom (or sent it).
 */
export function MessageList({
  channel,
  userId,
  messages,
  hasOlder,
  loadingOlder,
  onLoadOlder,
}: {
  channel: ChatChannel
  userId: string
  messages: ChatMessage[]
  hasOlder: boolean
  loadingOlder: boolean
  onLoadOlder: () => void
}) {
  const scroller = React.useRef<HTMLDivElement>(null)
  const [viewing, setViewing] = React.useState<ChatMessage["image"] | null>(
    null
  )
  const prev = React.useRef<{ first?: string; last?: string; height: number }>({
    height: 0,
  })

  const first = messages[0]?.id
  const last = messages.at(-1)
  React.useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const before = prev.current
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 120 ||
      before.last === undefined
    if (before.first && first !== before.first && last?.id === before.last) {
      // Older messages were prepended: hold the visible position.
      el.scrollTop += el.scrollHeight - before.height
    } else if (
      last?.id !== before.last &&
      (nearBottom || last?.senderId === userId)
    ) {
      el.scrollTop = el.scrollHeight
    }
    prev.current = { first, last: last?.id, height: el.scrollHeight }
  }, [first, last, userId])

  const showSender = channel.kind === "group" || channel.kind === "room"
  const byId = new Map(channel.members.map((member) => [member.id, member]))

  return (
    <div
      ref={scroller}
      className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-4 py-4"
    >
      {hasOlder && (
        <div className="flex justify-center pb-2">
          <Button
            size="sm"
            variant="muted"
            isDisabled={loadingOlder}
            onPress={onLoadOlder}
          >
            {loadingOlder ? <Spinner /> : m.chat_load_older()}
          </Button>
        </div>
      )}
      {messages.length === 0 && (
        <p className="m-auto text-sm text-muted-foreground">
          {m.chat_no_messages()}
        </p>
      )}
      {messages.map((message, i) => {
        const at = new Date(message.createdAt)
        const previous: ChatMessage | undefined =
          i > 0 ? messages[i - 1] : undefined
        const newDay = !previous || !sameDay(new Date(previous.createdAt), at)
        const mine = message.senderId === userId
        const status = mine
          ? getMessageStatus(message, channel, userId)
          : undefined
        const isLastMineMessage =
          mine &&
          (i === messages.length - 1 ||
            messages.slice(i + 1).every((m) => m.senderId !== userId))
        const sender = byId.get(message.senderId)
        const startsRun =
          newDay || previous.senderId !== message.senderId || previous.system
        return (
          <React.Fragment key={message.id}>
            {newDay && (
              <p className="my-2 text-center text-xs text-muted-foreground">
                {dayFormat().format(at)}
              </p>
            )}
            <div
              className={cn(
                "flex items-end gap-2",
                mine ? "flex-row-reverse" : "flex-row",
                startsRun && "mt-2"
              )}
            >
              {!mine && showSender && (
                <div className={cn("w-6 shrink-0", !startsRun && "invisible")}>
                  <UserAvatar
                    size="sm"
                    name={sender?.name ?? m.chat_untitled()}
                    image={sender?.image}
                  />
                </div>
              )}
              <div
                className={cn(
                  "flex max-w-4/5 flex-col gap-1",
                  mine ? "items-end" : "items-start"
                )}
              >
                {!mine && showSender && startsRun && (
                  <span className="px-1 text-xs text-muted-foreground">
                    {sender?.name ?? m.chat_untitled()}
                  </span>
                )}
                <div
                  className={cn(
                    "flex flex-col gap-2 rounded-2xl px-3 py-2 text-sm wrap-anywhere whitespace-pre-wrap",
                    mine ? "bg-electric text-white" : "bg-muted text-foreground"
                  )}
                  title={timeFormat().format(at)}
                >
                  {message.image && (
                    <button
                      type="button"
                      className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                      aria-label={m.chat_image_view()}
                      onClick={() => setViewing(message.image)}
                    >
                      <img
                        src={message.image.thumbUrl}
                        alt={m.chat_image_alt()}
                        width={message.image.width}
                        height={message.image.height}
                        loading="lazy"
                        className="max-h-64 w-auto max-w-full rounded-xl object-cover"
                      />
                    </button>
                  )}
                  {message.text && <span>{message.text}</span>}
                </div>
                <div
                  className={cn(
                    "flex items-center gap-1 px-1 text-mini text-muted-foreground",
                    mine && "justify-end"
                  )}
                >
                  <span>{timeFormat().format(at)}</span>
                  {mine && (
                    <span
                      className="inline-flex items-center"
                      title={
                        status === "seen"
                          ? m.chat_status_seen()
                          : status === "delivered"
                            ? m.chat_status_delivered()
                            : status === "sending"
                              ? m.chat_status_sending()
                              : m.chat_status_sent()
                      }
                    >
                      {status === "sending" && (
                        <Clock className="size-3 animate-pulse text-muted-foreground/60" />
                      )}
                      {status === "sent" && (
                        <Check className="size-3 text-muted-foreground/70" />
                      )}
                      {status === "delivered" && (
                        <CheckCheck className="size-3 text-muted-foreground/80" />
                      )}
                      {status === "seen" && (
                        <CheckCheck className="size-3.5 text-brand" />
                      )}
                    </span>
                  )}
                </div>
                {mine && isLastMineMessage && (
                  <span
                    className={cn(
                      "px-1 text-micro transition-colors",
                      status === "seen"
                        ? "font-medium text-brand"
                        : "text-muted-foreground"
                    )}
                  >
                    {status === "seen"
                      ? m.chat_status_seen()
                      : status === "delivered"
                        ? m.chat_status_delivered()
                        : status === "sending"
                          ? m.chat_status_sending()
                          : m.chat_status_sent()}
                  </span>
                )}
              </div>
            </div>
          </React.Fragment>
        )
      })}
      <Dialog
        isOpen={viewing != null}
        onOpenChange={(open) => !open && setViewing(null)}
        className="sm:max-w-3xl"
      >
        {viewing && (
          <img
            src={viewing.url}
            alt={m.chat_image_alt()}
            className="max-h-vh-88 w-full rounded-2xl object-contain"
          />
        )}
      </Dialog>
    </div>
  )
}
