import * as React from "react"
import { toast } from "sonner"

import { useData } from "@/features/dashboard/components/data-provider"
import type { ExpiredEvent } from "@/features/play/lib/session-types"
import { m } from "@/paraglide/messages"

/** How often the derived expiry view re-evaluates. */
const TICK_MS = 30_000

interface SessionUiContextValue {
  /**
   * Server "now" advanced on a 30 s tick (never `Date.now()` during render).
   * Derived expiry views and RSVP filters key off this.
   */
  now: number
  /** Own-doc rooms I consider "joined" for Match Maker purposes. */
  localJoinedIds: Set<string>
  addLocalJoined: (sessionId: string) => void
  dropJoined: (sessionId: string) => void
  /** The room open in the active-room sheet. */
  activeSessionId: string | null
  setActiveSessionId: (id: string | null) => void
  setActiveRoomId: (id: string, title?: string) => void
  expiredEvents: ExpiredEvent[]
  addExpiredEvents: (events: ExpiredEvent[]) => void
  /**
   * Read flags for client-only notification items (expiry events). Server
   * notifications keep their read flag in React Query so a failed request can
   * roll it back.
   */
  readLocal: Set<string>
  markLocalRead: (id: string) => void
  markAllLocalRead: (ids: string[]) => void
  managerOpen: boolean
  setManagerOpen: (open: boolean) => void
  openManager: (sessionId: string) => void
  quickJoinOpen: boolean
  setQuickJoinOpen: (open: boolean) => void
  openQuickJoin: () => void
  createRoomOpen: boolean
  setCreateRoomOpen: (open: boolean) => void
  openCreateRoom: () => void
  playOpen: boolean
  openPlay: () => void
  closePlay: () => void
}

const SessionUiContext = React.createContext<SessionUiContextValue | null>(null)

export function useSessionUi() {
  const ctx = React.useContext(SessionUiContext)
  if (!ctx) {
    throw new Error("useSessionUi must be used within a SessionUiProvider.")
  }
  return ctx
}

/**
 * UI-only session state shared across dashboard navigation: which sheet/dialog
 * is open, the active room, local join bookkeeping, and the ticking clock that
 * drives derived expiry views. No server data lives here.
 */
export function SessionUiProvider({ children }: { children: React.ReactNode }) {
  const { serverNow } = useData()
  const [now, setNow] = React.useState(() => Date.parse(serverNow))
  const [localJoinedIds, setLocalJoinedIds] = React.useState<Set<string>>(
    () => new Set()
  )
  const [activeSessionId, setActiveSessionId] = React.useState<string | null>(
    null
  )
  const [expiredEvents, setExpiredEvents] = React.useState<ExpiredEvent[]>([])
  const [readLocal, setReadLocal] = React.useState<Set<string>>(new Set())
  const [managerOpen, setManagerOpen] = React.useState(false)
  const [quickJoinOpen, setQuickJoinOpen] = React.useState(false)
  const [createRoomOpen, setCreateRoomOpen] = React.useState(false)
  const [playOpen, setPlayOpen] = React.useState(false)
  const seenExpired = React.useRef<Set<string>>(new Set())

  React.useEffect(() => {
    setNow(Date.parse(serverNow))
  }, [serverNow])

  React.useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(interval)
  }, [])

  const addExpiredEvents = React.useCallback((events: ExpiredEvent[]) => {
    const fresh = events.filter((event) => !seenExpired.current.has(event.id))
    if (!fresh.length) return
    for (const event of fresh) seenExpired.current.add(event.id)
    setExpiredEvents((prev) => [...prev, ...fresh])
    for (const event of fresh) {
      if (event.kind === "hold") {
        toast(m.booking_toast_hold_expired(), {
          description: event.description ?? event.title,
        })
      } else {
        toast(
          event.kind === "request"
            ? m.session_toast_request_expired()
            : m.session_toast_invite_expired(),
          { description: event.title }
        )
      }
    }
  }, [])

  const markLocalRead = React.useCallback((id: string) => {
    setReadLocal((prev) => {
      if (prev.has(id)) return prev
      return new Set(prev).add(id)
    })
  }, [])

  const markAllLocalRead = React.useCallback((ids: string[]) => {
    setReadLocal((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.add(id)
      return next
    })
  }, [])

  const addLocalJoined = React.useCallback((sessionId: string) => {
    setLocalJoinedIds((prev) => new Set(prev).add(sessionId))
  }, [])

  const dropJoined = React.useCallback((sessionId: string) => {
    setLocalJoinedIds((prev) => {
      const next = new Set(prev)
      next.delete(sessionId)
      return next
    })
    setActiveSessionId((current) => (current === sessionId ? null : current))
  }, [])

  const setActiveRoomId = React.useCallback((id: string, title?: string) => {
    setActiveSessionId(id)
    toast(m.session_toast_active_now({ title: title ?? "" }))
  }, [])

  const openManager = React.useCallback((sessionId: string) => {
    setActiveSessionId(sessionId)
    setManagerOpen(true)
  }, [])

  const value = React.useMemo<SessionUiContextValue>(
    () => ({
      now,
      localJoinedIds,
      addLocalJoined,
      dropJoined,
      activeSessionId,
      setActiveSessionId,
      setActiveRoomId,
      expiredEvents,
      addExpiredEvents,
      readLocal,
      markLocalRead,
      markAllLocalRead,
      managerOpen,
      setManagerOpen,
      openManager,
      quickJoinOpen,
      setQuickJoinOpen,
      openQuickJoin: () => setQuickJoinOpen(true),
      createRoomOpen,
      setCreateRoomOpen,
      openCreateRoom: () => setCreateRoomOpen(true),
      playOpen,
      openPlay: () => setPlayOpen(true),
      closePlay: () => setPlayOpen(false),
    }),
    [
      now,
      localJoinedIds,
      addLocalJoined,
      dropJoined,
      activeSessionId,
      setActiveRoomId,
      expiredEvents,
      addExpiredEvents,
      readLocal,
      markLocalRead,
      markAllLocalRead,
      managerOpen,
      openManager,
      quickJoinOpen,
      createRoomOpen,
      playOpen,
    ]
  )

  return (
    <SessionUiContext.Provider value={value}>
      {children}
    </SessionUiContext.Provider>
  )
}
