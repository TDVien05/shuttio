import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
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
import type {
  NotificationItem,
  NotificationKind,
  NotificationRecord,
} from "@/features/dashboard/data"
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/features/dashboard/notification-api"
import { useMatchmaking } from "@/features/play/matchmaking"
import { ROOMS_CHANGED_EVENT } from "@/features/play/session"
import { m } from "@/paraglide/messages"

/** How often the notification centre polls `GET /api/notifications`. */
const POLL_MS = 10_000
/** A notification this recent still toasts on the first load. */
const FRESH_NOTIFICATION_MS = 60_000

const NOTIFICATIONS_KEY = ["notifications"]

interface NotificationsContextValue {
  items: NotificationItem[]
  unreadCount: number
  markRead: (id: string) => void
  markAllRead: () => void
}

const NotificationsContext =
  React.createContext<NotificationsContextValue | null>(null)

export function useNotifications() {
  const ctx = React.useContext(NotificationsContext)
  if (!ctx) {
    throw new Error(
      "useNotifications must be used within a NotificationsProvider."
    )
  }
  return ctx
}

/**
 * Notification centre, mounted in the dashboard layout. Server notifications
 * (an operator's approve/decline, an auto-confirm, a no-show mark, …) come
 * from polling `GET /api/notifications`; a live room change refetches right
 * away. Matchmaking expiry events add client-only items on top.
 */
export function NotificationsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const queryClient = useQueryClient()
  const { expiredEvents } = useMatchmaking()
  const { data: records = [] } = useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: listNotifications,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  })
  // Client-only items (expiry events) have no server row to flip.
  const [readLocal, setReadLocal] = React.useState<Set<string>>(new Set())

  // A live room change usually comes with a notification for this user.
  React.useEffect(() => {
    const refetch = () =>
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY })
    window.addEventListener(ROOMS_CHANGED_EVENT, refetch)
    return () => window.removeEventListener(ROOMS_CHANGED_EVENT, refetch)
  }, [queryClient])

  // Toast genuinely new unread notifications. The first load only toasts very
  // fresh ones — a mount shouldn't replay everything that arrived while away.
  const seen = React.useRef<Set<string> | null>(null)
  React.useEffect(() => {
    const firstLoad = seen.current === null
    for (const r of records) {
      if (r.read || seen.current?.has(r.id)) continue
      const age = Date.now() - Date.parse(r.createdAt)
      if (!firstLoad || age <= FRESH_NOTIFICATION_MS) toast(r.text)
    }
    seen.current = new Set(records.map((r) => r.id))
  }, [records])

  const items = React.useMemo<NotificationItem[]>(() => {
    const now = new Date()
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
      time: relativeTime(new Date(r.createdAt), now),
    }))
    return [...expired.reverse(), ...server]
  }, [expiredEvents, records, readLocal])

  const setServerRead = (read: (r: NotificationRecord) => boolean) =>
    queryClient.setQueryData<NotificationRecord[]>(NOTIFICATIONS_KEY, (prev) =>
      prev?.map((r) => (read(r) ? { ...r, read: true } : r))
    )

  // Optimistic: flip local state immediately, mirror to the server in the
  // background (a client-only id no-ops server-side harmlessly).
  const markRead = (id: string) => {
    setReadLocal((prev) => new Set(prev).add(id))
    setServerRead((r) => r.id === id)
    markNotificationRead(id).catch(() => {})
  }
  const markAllRead = () => {
    setReadLocal(new Set(items.map((n) => n.id)))
    setServerRead(() => true)
    markAllNotificationsRead().catch(() => {})
  }

  const unreadCount = items.reduce((n, item) => n + (item.read ? 0 : 1), 0)

  return (
    <NotificationsContext.Provider
      value={{ items, unreadCount, markRead, markAllRead }}
    >
      {children}
    </NotificationsContext.Provider>
  )
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
          <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-brand px-1 font-mono text-[10px] leading-4 font-semibold text-brand-foreground tabular-nums">
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
              variant="ghost"
              size="xs"
              className="rounded-full text-muted-foreground"
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
                    <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
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
