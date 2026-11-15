import * as React from "react"
import { getLocale } from "@/paraglide/runtime"
import { toast } from "sonner"

import {
  activeRoster,
  addDaysIso,
  durationOf,
  initialsOf,
  levelMatches,
  locStr,
} from "@/lib/shared"
import type {
  MatchRoom,
  PlaySession,
  RoomLevel,
  SessionPlayer,
  SportKey,
} from "@/lib/shared"
import { useData } from "@/features/dashboard/components/data-provider"
import { useAuthUser } from "@/features/dashboard/hooks/use-auth-user"
import { useSessionData } from "@/features/play/hooks/use-session-data"
import { useSessionUi } from "@/features/play/state/session-ui"
import type { QuickJoinFilters } from "@/features/play/lib/session-types"
import { MAX_CAPACITY, MAX_HOSTED_ROOMS } from "@/features/play/lib/limits"
import { useBookingWizard } from "@/features/booking/hooks/use-booking-wizard"
import {
  RoomActionError,
  useCancelBookingRecord,
  useDecideRoomRequest,
  useDisbandRoom,
  useLeaveRoomMembership,
  useRequestJoinRoom,
  useSaveSession,
} from "@/features/play/api/session.queries"
import {
  createRoomChat,
  freezeRoomChat,
  removeRoomMember,
} from "@/features/chat/api/chat-api"
import { removeGroupMember } from "@/features/chat/api/group-api"
import { m } from "@/paraglide/messages"

/** A session id unique across every user — rooms are looked up by id alone. */
function newId(prefix: string): string {
  return `s-${prefix}-${crypto.randomUUID()}`
}

function openRoomChat(sessionId: string, title: string) {
  void createRoomChat({ roomId: sessionId, name: title }).catch(
    (err: unknown) => {
      console.error("Failed to create room chat", err)
    }
  )
}

function freezeRoomChatBestEffort(sessionId: string) {
  void freezeRoomChat(sessionId).catch((err: unknown) => {
    console.error("Failed to freeze room chat", err)
  })
}

function removeRealRoomMember(session: PlaySession, player: SessionPlayer) {
  if (!player.userId) return
  const request = session.chatChannelId
    ? removeGroupMember(session.chatChannelId, player.userId)
    : removeRoomMember({ roomId: session.id, memberId: player.userId })
  void request.catch((err: unknown) => {
    console.error("Failed to remove room member", err)
  })
}

/**
 * All session/room write actions. Server state is changed through mutation
 * hooks; this layer only applies the rules the API expects (capacity, host
 * caps, overlap, who is a real chat member) and shows the Vietnamese toasts.
 */
export function useSessionActions() {
  const locale = getLocale()
  const authUser = useAuthUser()
  const { courts, todayIso, dayLabelFor, playerByInitials, courtByVenue } =
    useData()
  const data = useSessionData()
  const ui = useSessionUi()
  const { openBooking } = useBookingWizard()

  const save = useSaveSession()
  const requestJoinMutation = useRequestJoinRoom()
  const decide = useDecideRoomRequest()
  const disband = useDisbandRoom()
  const leave = useLeaveRoomMembership()
  const cancelRecord = useCancelBookingRecord()

  const {
    sessions,
    otherRooms,
    rooms,
    joinedIds,
    requestedIds,
    canHostMore,
    userInitials,
    userName,
    userLevelForSport,
    hasTimeConflict,
    overlappingFor,
  } = data

  const requestJoin = React.useCallback(
    (room: MatchRoom) => {
      requestJoinMutation.mutate(
        {
          roomId: room.id,
          userId: authUser.id,
          userName,
          initials: userInitials,
          at: Date.now(),
        },
        {
          onSuccess: () => {
            ui.setActiveSessionId(room.id)
            toast(m.match_maker_toast_requested(), {
              description: [room.title, room.venue].filter(Boolean).join(" · "),
            })
          },
          onError: (error) => {
            toast.error(m.session_toast_request_failed(), {
              description: error.message,
            })
          },
        }
      )
    },
    [authUser.id, requestJoinMutation, ui, userInitials, userName]
  )

  const joinRoom = React.useCallback(
    (room: MatchRoom) => {
      if (room.demo) {
        toast.error(m.match_maker_toast_demo_room())
        return
      }
      if (joinedIds.has(room.id)) {
        ui.setActiveRoomId(room.id, room.title)
        ui.setManagerOpen(true)
        return
      }
      // Already asked and awaiting the host — don't re-toast.
      if (requestedIds.has(room.id)) return
      // A player can only physically attend one game at a time.
      const clash = overlappingFor(room)
      if (clash) {
        toast.error(m.session_toast_overlap_title(), {
          description: m.session_toast_overlap_body({ title: clash.title }),
        })
        return
      }
      requestJoin(room)
    },
    [joinedIds, overlappingFor, requestJoin, requestedIds, ui]
  )

  const approveRequest = React.useCallback(
    (sessionId: string, initials: string) => {
      const session = sessions.find((s) => s.id === sessionId)
      const target = session?.roster.find(
        (p) => p.initials === initials && p.rsvp === "requested"
      )
      if (!session || !target?.userId) return
      if (activeRoster(session).length >= session.capacity) {
        toast.error(m.session_toast_full())
        return
      }
      const name = target.name || playerByInitials(initials).name
      void decide
        .mutateAsync({
          roomId: sessionId,
          targetUserId: target.userId,
          decision: "approve",
        })
        .then(() =>
          toast.success(m.session_toast_approved(), { description: name })
        )
        .catch((error: unknown) => {
          toast.error(m.session_toast_approve_failed(), {
            description: error instanceof Error ? error.message : undefined,
          })
        })
    },
    [decide, playerByInitials, sessions]
  )

  const declineRequest = React.useCallback(
    (sessionId: string, initials: string) => {
      const session = sessions.find((s) => s.id === sessionId)
      const target = session?.roster.find(
        (p) => p.initials === initials && p.rsvp === "requested"
      )
      if (!session || !target?.userId) return
      const name = target.name || playerByInitials(initials).name
      void decide
        .mutateAsync({
          roomId: sessionId,
          targetUserId: target.userId,
          decision: "decline",
        })
        .then(() => toast(m.session_toast_declined(), { description: name }))
        .catch((error: unknown) => {
          toast.error(m.session_toast_decline_failed(), {
            description: error instanceof Error ? error.message : undefined,
          })
        })
    },
    [decide, playerByInitials, sessions]
  )

  const disbandOwnRoom = React.useCallback(
    async (sessionId: string): Promise<boolean> => {
      const own = sessions.find((s) => s.id === sessionId)
      if (!own) return true
      // A paid court becomes a cancellation request the venue answers; the
      // booking stays the host's until then. A 409 means it can't be requested
      // again — the room still goes, the booking is kept.
      let bookingCancelled = !own.reservationId
      if (own.reservationId) {
        try {
          const summary = await cancelRecord.mutateAsync(own.reservationId)
          bookingCancelled = summary.status === "cancelled"
        } catch (error) {
          if (!(error instanceof RoomActionError && error.status === 409)) {
            toast.error(m.booking_toast_cancel_failed(), {
              description: error instanceof Error ? error.message : undefined,
            })
            return false
          }
        }
      }
      try {
        await disband.mutateAsync(sessionId)
      } catch (error) {
        // 404: the room was never persisted — nothing to remove server-side.
        if (!(error instanceof RoomActionError && error.status === 404)) {
          toast.error(m.session_toast_disband_failed(), {
            description: error instanceof Error ? error.message : undefined,
          })
          return false
        }
      }
      // Cancelling a booked room freezes its chat (keeps history).
      if (own.status === "booked") freezeRoomChatBestEffort(sessionId)
      ui.dropJoined(sessionId)
      toast(m.session_toast_disbanded(), {
        description: bookingCancelled
          ? own.title
          : m.booking_toast_cancel_requested(),
      })
      return true
    },
    [cancelRecord, disband, sessions, ui]
  )

  const leaveRoom = React.useCallback(
    (sessionId: string) => {
      const session = sessions.find((s) => s.id === sessionId)
      // Approved group members receive the host's room in `/api/sessions` too
      // (as a `groupSession`). Only the host disbands it; a member leaves.
      if (session?.host.initials === userInitials) {
        void disbandOwnRoom(sessionId)
        return
      }
      const room = otherRooms.find((s) => s.id === sessionId) ?? session
      if (!room) return
      void leave
        .mutateAsync(sessionId)
        .then((result) => {
          if (result.status === "left") ui.dropJoined(sessionId)
          toast(m.match_maker_toast_left(), { description: room.title })
        })
        .catch((error: unknown) => {
          toast.error(m.session_toast_leave_failed(), {
            description: error instanceof Error ? error.message : undefined,
          })
        })
    },
    [disbandOwnRoom, leave, otherRooms, sessions, ui, userInitials]
  )

  /** Convert a freshly-built MatchRoom (Create Room dialog) into a session. */
  const addRoom = React.useCallback(
    (room: MatchRoom) => {
      if (!canHostMore) {
        toast.error(m.match_maker_toast_limit_title(), {
          description: m.match_maker_toast_limit_body({
            max: MAX_HOSTED_ROOMS,
          }),
        })
        return
      }
      const self = room.courtMode === "self"
      // A self-booked court is never one of the app's courts, even if a
      // venue on the app happens to share its name.
      const court = self ? undefined : courtByVenue(room.venue)
      const next: PlaySession = {
        id: room.id,
        title: room.title,
        sport: room.sport,
        format: room.format,
        courtId: self ? null : (room.courtId ?? court?.id ?? null),
        ...(self
          ? {
              courtMode: "self" as const,
              selfCourt: room.selfCourt,
              ranked: room.ranked ?? true,
            }
          : {}),
        dayKey: room.dayKey ?? todayIso,
        dayLabel: room.day,
        slot: room.time ? room.time.split(" – ")[0] : null,
        durationMin: room.durationMin ?? durationOf(room.time),
        courtLabel: null,
        host: room.host,
        capacity: room.capacity,
        roster: room.players.map((init) => ({
          name:
            init === room.host.initials
              ? room.host.name
              : playerByInitials(init).name,
          initials: init,
          rsvp: init === room.host.initials ? "host" : "going",
        })),
        level: room.level,
        status: "forming",
        listed: true,
        fillIntent: "find",
        venue: room.venue,
        ward: room.ward,
        distanceKm: room.distanceKm,
        pricePerHour: room.pricePerHour,
      }
      save.mutate(next)
      ui.addLocalJoined(room.id)
      ui.setActiveSessionId(room.id)
      openRoomChat(next.id, next.title)
    },
    [canHostMore, courtByVenue, playerByInitials, save, todayIso, ui]
  )

  const createInviteRoom = React.useCallback(
    (input: {
      title: string
      sport: SportKey
      format: "Singles" | "Doubles"
      courtId?: string | null
      venue: string
      ward: string
      distanceKm: number | null
      dayKey: string
      dayLabel: string
      slot: string
      durationMin: number
      level: RoomLevel
      pricePerHour: number
      invitees: string[]
    }) => {
      const id = newId("grp")
      const base: PlaySession = {
        id,
        title: input.title,
        sport: input.sport,
        format: input.format,
        courtId: input.courtId ?? null,
        dayKey: input.dayKey,
        dayLabel: input.dayLabel,
        slot: input.slot,
        durationMin: input.durationMin,
        courtLabel: null,
        host: { name: userName, initials: userInitials },
        capacity: Math.max(
          input.invitees.length + 1,
          input.format === "Singles" ? 2 : 4
        ),
        roster: [{ name: userName, initials: userInitials, rsvp: "host" }],
        level: input.level,
        status: "forming",
        listed: false,
        fillIntent: "invite",
        venue: input.venue,
        ward: input.ward,
        distanceKm: input.distanceKm,
        pricePerHour: input.pricePerHour,
      }
      const full: PlaySession = {
        ...base,
        roster: [
          ...base.roster,
          ...input.invitees.map((initials): SessionPlayer => ({
            name: playerByInitials(initials).name,
            initials,
            rsvp: "pending",
            rsvpAt: Date.now(),
          })),
        ],
      }
      save.mutate(full)
      ui.addLocalJoined(id)
      ui.setActiveSessionId(id)
      openRoomChat(id, input.title)
      return id
    },
    [playerByInitials, save, ui, userInitials, userName]
  )

  const setRoomCapacity = React.useCallback(
    (sessionId: string, capacity: number) => {
      const session = sessions.find((s) => s.id === sessionId)
      if (!session) return
      const next: PlaySession = {
        ...session,
        capacity: Math.max(
          activeRoster(session).length,
          Math.min(MAX_CAPACITY, capacity)
        ),
      }
      if (next.capacity === session.capacity) return
      save.mutate(next)
    },
    [save, sessions]
  )

  const invitePlayer = React.useCallback(
    (sessionId: string, initials: string) => {
      const session = sessions.find((s) => s.id === sessionId)
      if (
        !session ||
        activeRoster(session).length >= session.capacity ||
        session.roster.some((p) => p.initials === initials)
      )
        return
      const next: PlaySession = {
        ...session,
        roster: [
          ...session.roster,
          {
            name: playerByInitials(initials).name,
            initials,
            rsvp: "pending",
            rsvpAt: Date.now(),
          },
        ],
      }
      save.mutate(next)
    },
    [playerByInitials, save, sessions]
  )

  const kickPlayer = React.useCallback(
    (sessionId: string, initials: string) => {
      if (initials === userInitials) return
      const session = sessions.find((s) => s.id === sessionId)
      if (!session) return
      const player = session.roster.find((p) => p.initials === initials)
      if (!player) return
      const next: PlaySession = {
        ...session,
        roster: session.roster.filter((p) => p.initials !== initials),
      }
      save.mutate(next)
      removeRealRoomMember(session, player)
    },
    [save, sessions, userInitials]
  )

  const createGroupSession = React.useCallback(
    (input: {
      channelId: string
      title: string
      members: { id: string; name: string }[]
    }): string => {
      const id = newId("grp")
      const session: PlaySession = {
        id,
        title: input.title,
        sport: "badminton",
        format: input.members.length + 1 >= 4 ? "Doubles" : "Singles",
        courtId: null,
        dayKey: todayIso,
        dayLabel: locStr(dayLabelFor(todayIso), locale),
        slot: null,
        durationMin: 60,
        courtLabel: null,
        host: { name: userName, initials: userInitials },
        capacity: Math.max(input.members.length + 1, 2),
        roster: [
          { name: userName, initials: userInitials, rsvp: "host" },
          ...input.members.map((member): SessionPlayer => ({
            name: member.name,
            initials: initialsOf(member.name),
            rsvp: "going",
            userId: member.id,
          })),
        ],
        level: "any",
        status: "forming",
        listed: false,
        fillIntent: "court",
        venue: "",
        ward: "",
        distanceKm: null,
        pricePerHour: 0,
        chatChannelId: input.channelId,
      }
      save.mutate(session)
      openBooking(null, { roomId: id, linked: session })
      return id
    },
    [dayLabelFor, locale, openBooking, save, todayIso, userInitials, userName]
  )

  const addTeamToSession = React.useCallback(
    (sessionId: string) => {
      const target = sessions.find((s) => s.id === sessionId)
      if (!target) return
      // A solo booking has no chat; opening it to others is when it gets one.
      openRoomChat(sessionId, target.title)
      save.mutate({ ...target, listed: true, fillIntent: "invite" })
      ui.addLocalJoined(sessionId)
      ui.setActiveSessionId(sessionId)
      ui.setManagerOpen(true)
      toast(m.session_toast_add_team())
    },
    [save, sessions, ui]
  )

  // Atomically grow capacity + add players in one write so the stale-roster
  // guard in invitePlayer is bypassed. Returns the count actually added.
  const addPlayersToSession = React.useCallback(
    (sessionId: string, initials: string[]): number => {
      const session = sessions.find((s) => s.id === sessionId)
      if (!session) return 0
      const fresh = initials.filter(
        (init) => !session.roster.some((p) => p.initials === init)
      )
      if (!fresh.length) return 0
      const currentActive = activeRoster(session).length
      const canFit = Math.max(0, MAX_CAPACITY - currentActive)
      const toAdd = fresh.slice(0, canFit)
      if (!toAdd.length) return 0
      save.mutate({
        ...session,
        capacity: Math.max(session.capacity, currentActive + toAdd.length),
        roster: [
          ...session.roster,
          ...toAdd.map((init): SessionPlayer => ({
            name: playerByInitials(init).name,
            initials: init,
            rsvp: "pending",
            rsvpAt: Date.now(),
          })),
        ],
      })
      return toAdd.length
    },
    [playerByInitials, save, sessions]
  )

  const cancelBooking = React.useCallback(
    async (id: string) => {
      const session = sessions.find((s) => s.id === id)
      if (!session) return
      let cancelReason: string | undefined
      if (session.reservationId) {
        try {
          const summary = await cancelRecord.mutateAsync(session.reservationId)
          cancelReason = summary.cancelReason
        } catch (error) {
          toast.error(m.booking_toast_cancel_failed(), {
            description: error instanceof Error ? error.message : undefined,
          })
          return
        }
      }
      if (session.listed) {
        // Keep the team's room open, drop the court hold (back to forming).
        save.mutate({
          ...session,
          status: "forming",
          hold: undefined,
          courtLabel: null,
          slot: null,
          venueId: undefined,
          reservationId: undefined,
        })
      } else {
        save.mutate({ ...session, status: "cancelled", cancelReason })
        ui.dropJoined(id)
        freezeRoomChatBestEffort(id)
      }
      toast(m.booking_toast_cancelled(), { description: session.venue })
    },
    [cancelRecord, save, sessions, ui]
  )

  const matchesQuickFilters = React.useCallback(
    (room: MatchRoom, filters: QuickJoinFilters) => {
      if (filters.courtId) {
        const court = courts.find((c) => c.id === filters.courtId)
        if (!court || room.venue !== court.name) return false
      }
      if (
        filters.maxDistanceKm !== null &&
        (room.distanceKm === null || room.distanceKm > filters.maxDistanceKm)
      )
        return false
      if (filters.day === "today" && room.dayKey !== todayIso) return false
      if (
        filters.day === "today-tomorrow" &&
        room.dayKey !== todayIso &&
        room.dayKey !== addDaysIso(todayIso, 1)
      )
        return false
      if (filters.format !== "any" && room.format !== filters.format)
        return false
      if (filters.level === "any") return true
      const target =
        filters.level === "my" ? userLevelForSport(room.sport) : filters.level
      return levelMatches(target, room.level)
    },
    [courts, todayIso, userLevelForSport]
  )

  const quickJoin = React.useCallback(
    (filters: QuickJoinFilters) => {
      const pool = rooms.filter(
        (room) =>
          data.isSuitable(room) &&
          !hasTimeConflict(room) &&
          matchesQuickFilters(room, filters)
      )
      if (pool.length) {
        const best = [...pool].sort((a, b) => {
          const exact = (room: MatchRoom) =>
            room.level === userLevelForSport(room.sport) ? 0 : 1
          if (exact(a) !== exact(b)) return exact(a) - exact(b)
          if (a.distanceKm !== b.distanceKm)
            return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)
          return b.joined / b.capacity - a.joined / a.capacity
        })[0]
        joinRoom(best)
        return
      }
      if (!canHostMore) {
        toast.error(m.match_maker_toast_limit_title(), {
          description: m.match_maker_toast_limit_body({
            max: MAX_HOSTED_ROOMS,
          }),
        })
        return
      }
      toast(m.match_maker_toast_no_room_title(), {
        description: m.match_maker_toast_no_room_body(),
      })
      ui.setCreateRoomOpen(true)
    },
    [
      canHostMore,
      data,
      hasTimeConflict,
      joinRoom,
      matchesQuickFilters,
      rooms,
      ui,
      userLevelForSport,
    ]
  )

  return {
    joinRoom,
    approveRequest,
    declineRequest,
    leaveRoom,
    disbandOwnRoom,
    addRoom,
    createInviteRoom,
    quickJoin,
    setRoomCapacity,
    invitePlayer,
    kickPlayer,
    createGroupSession,
    addTeamToSession,
    addPlayersToSession,
    cancelBooking,
    openManager: ui.openManager,
  }
}
