import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { toast } from "sonner"
import {
  Bell,
  CalendarCheck,
  Flame,
  MessageSquare,
  Sparkles,
  TrendingUp,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { relativeTime } from "@/lib/relative-time"
import { Button } from "@/components/ui/button"
import { Popover, PopoverTrigger } from "@/components/ui/popover"
import type { NotificationItem, NotificationKind } from "@/lib/shared"
import {
  notificationQueries,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from "@/features/dashboard/api/dashboard.queries"
import { useSessionUi } from "@/features/play/state/session-ui"
import { m } from "@/paraglide/messages"

/** A notification this recent still toasts on the first load. */
const FRESH_NOTIFICATION_MS = 60_000

/**
 * The notification centre's derived view. Server rows come from React Query;
 * client-only expiry items come from the shared session UI store.
 */
export function useNotifications() {
  const { data: records = [] } = useQuery(notificationQueries.list())
  const { now, expiredEvents, readLocal, markLocalRead, markAllLocalRead } =
    useSessionUi()
  const markReadMutation = useMarkNotificationRead()
  const markAllReadMutation = useMarkAllNotificationsRead()

  const items = React.useMemo<NotificationItem[]>(() => {
    const expired = expiredEvents.map((e): NotificationItem => ({
      id: e.id,
      kind: e.kind === "hold" ? "booking" : "match",
      text:
        e.kind === "hold"
          ? m.notifications_hold_expired({ title: e.title })
          : e.kind === "request"
            ? m.notifications_request_expired({ name: e.title })
            : m.notifications_invite_expired({ name: e.title }),
      time: m.notifications_just_now(),
      read: readLocal.has(e.id),
    }))
    const server = records.map((r): NotificationItem => ({
      ...r,
      time: relativeTime(new Date(r.createdAt), new Date(now)),
    }))
    return [...expired.reverse(), ...server]
  }, [expiredEvents, records, readLocal, now])

  // Server rows are optimistically flipped in the query cache (and restored on
  // failure); only client-only expiry items need a local read flag.
  const markRead = React.useCallback(
    (id: string) => {
      if (expiredEvents.some((event) => event.id === id)) {
        markLocalRead(id)
        return
      }
      markReadMutation.mutate(id)
    },
    [expiredEvents, markLocalRead, markReadMutation]
  )

  const markAllRead = React.useCallback(() => {
    markAllLocalRead(expiredEvents.map((event) => event.id))
    markAllReadMutation.mutate()
  }, [expiredEvents, markAllLocalRead, markAllReadMutation])

  const unreadCount = items.reduce((n, item) => n + (item.read ? 0 : 1), 0)

  return { items, unreadCount, markRead, markAllRead }
}

/**
 * Toast genuinely new unread server notifications. Mounted once in the
 * dashboard layout; the first load only toasts very fresh rows so mounting
 * doesn't replay everything that arrived while away.
 */
export function NotificationsToaster() {
  const { data: records = [] } = useQuery(notificationQueries.list())
  const seen = React.useRef<Set<string> | null>(null)

  React.useEffect(() => {
    const firstLoad = seen.current === null
    for (const record of records) {
      if (record.read || seen.current?.has(record.id)) continue
      const age = Date.now() - Date.parse(record.createdAt)
      if (!firstLoad || age <= FRESH_NOTIFICATION_MS) toast(record.text)
    }
    seen.current = new Set(records.map((record) => record.id))
  }, [records])

  return null
}

const kindIcon: Record<
  NotificationKind,
  React.ComponentType<{ className?: string }>
> = {
  match: Sparkles,
  chat: MessageSquare,
  booking: CalendarCheck,
  rating: TrendingUp,
  streak: Flame,
}

/** Topbar bell with an unread badge and a popover list of notifications. */
export function NotificationsButton({
  className,
  popupClassName,
}: {
  className?: string
  popupClassName?: string
}) {
  const { items, unreadCount, markRead, markAllRead } = useNotifications()
  const router = useRouter()
  const [open, setOpen] = React.useState(false)

  const onItemClick = (item: NotificationItem) => {
    markRead(item.id)
    if (item.href) void router.navigate({ href: item.href })
    setOpen(false)
  }

  return (
    <PopoverTrigger isOpen={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={m.notifications_title()}
        className={cn("relative", className)}
      >
        <Bell />
        {unreadCount > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-brand px-1 font-mono text-micro leading-4 font-semibold text-brand-foreground tabular-nums">
            {unreadCount}
          </span>
        ) : null}
      </Button>
      <Popover
        placement="bottom end"
        className={cn("w-80 gap-0 p-0", popupClassName)}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">{m.notifications_title()}</p>
          {unreadCount > 0 ? (
            <Button
              shape="pill"
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
              onPress={markAllRead}
            >
              {m.notifications_mark_all_read()}
            </Button>
          ) : null}
        </div>
        <div className="max-h-96 overflow-y-auto p-1.5">
          {items.length ? (
            items.map((item) => {
              const Icon = kindIcon[item.kind]
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onItemClick(item)}
                  className="flex w-full items-start gap-3 rounded-2xl p-2.5 text-left transition-colors hover:bg-muted/60"
                >
                  <span
                    className={cn(
                      "mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl",
                      item.read
                        ? "bg-muted text-muted-foreground"
                        : "bg-brand/12 text-brand"
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-sm leading-snug",
                        item.read
                          ? "text-muted-foreground"
                          : "font-medium text-foreground"
                      )}
                    >
                      {item.text}
                    </span>
                    <span className="mt-0.5 block font-mono text-micro text-muted-foreground">
                      {item.time}
                    </span>
                  </span>
                  {!item.read ? (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" />
                  ) : null}
                </button>
              )
            })
          ) : (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {m.notifications_empty()}
            </p>
          )}
        </div>
      </Popover>
    </PopoverTrigger>
  )
}
