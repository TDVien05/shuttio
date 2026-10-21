import * as React from "react"
import { useQuery, useSuspenseQuery } from "@tanstack/react-query"

import type { MatchRoom, PlaySession } from "@/lib/shared"
import { dashboardQueries } from "@/features/dashboard/api/dashboard.queries"
import { useData } from "@/features/dashboard/components/data-provider"
import { useAuthUser } from "@/features/dashboard/hooks/use-auth-user"
import { usePlayerIdentity } from "@/features/play/hooks/use-player-identity"
import { useSessionUi } from "@/features/play/state/session-ui"
import { sessionQueries } from "@/features/play/api/session.queries"
import {
  applyExpiryView,
  deriveActiveSession,
  deriveBookings,
  deriveCommittedSessions,
  deriveExpiredEvents,
  deriveHostedIds,
  deriveJoinedIds,
  deriveJoinedSessions,
  deriveOtherRooms,
  deriveRemoteJoinedIds,
  deriveRequestedIds,
  deriveRooms,
  deriveSessionMemberIds,
  hostedRoomCount,
  isRoomSuitable,
  overlappingCommitment,
  roomForViewer,
} from "@/features/play/lib/matchmaking-derive"
import { MAX_HOSTED_ROOMS } from "@/features/play/lib/limits"

/**
 * The player's session/room projections, read from React Query. Expired holds
 * and RSVPs are removed at read time (the server applies the same rules); the
 * stored cache entries are never rewritten.
 */
export function useSessionData() {
  const { courts } = useData()
  const { data: seed, dataUpdatedAt: seedUpdatedAt } = useSuspenseQuery(
    dashboardQueries.seed()
  )
  const authUser = useAuthUser()
  const identity = usePlayerIdentity()
  const { now, localJoinedIds, activeSessionId } = useSessionUi()

  const { data: rawSessions = seed.sessions } = useQuery({
    ...sessionQueries.mine(),
    initialData: seed.sessions,
    initialDataUpdatedAt: seedUpdatedAt,
  })
  const { data: remoteRooms = [] } = useQuery(sessionQueries.rooms())

  const sessions = React.useMemo(
    () => applyExpiryView(rawSessions, now),
    [rawSessions, now]
  )
  const otherRooms = React.useMemo(
    () => applyExpiryView(deriveOtherRooms(sessions, remoteRooms), now),
    [sessions, remoteRooms, now]
  )
  const expiredEvents = React.useMemo(
    () => deriveExpiredEvents(rawSessions, now),
    [rawSessions, now]
  )

  const hostedIds = React.useMemo(
    () => deriveHostedIds(sessions, identity.userInitials),
    [sessions, identity.userInitials]
  )
  const remoteJoinedIds = React.useMemo(
    () => deriveRemoteJoinedIds(otherRooms, authUser.id),
    [otherRooms, authUser.id]
  )
  const sessionMemberIds = React.useMemo(
    () => deriveSessionMemberIds(sessions, authUser.id),
    [sessions, authUser.id]
  )
  const joinedIds = React.useMemo(
    () =>
      deriveJoinedIds(
        localJoinedIds,
        hostedIds,
        remoteJoinedIds,
        sessionMemberIds
      ),
    [localJoinedIds, hostedIds, remoteJoinedIds, sessionMemberIds]
  )
  const requestedIds = React.useMemo(
    () => deriveRequestedIds(otherRooms, authUser.id),
    [otherRooms, authUser.id]
  )
  const rooms = React.useMemo(
    () => deriveRooms(sessions, otherRooms, courts),
    [sessions, otherRooms, courts]
  )
  const joinedSessions = React.useMemo(
    () =>
      deriveJoinedSessions(
        sessions,
        otherRooms,
        localJoinedIds,
        hostedIds,
        remoteJoinedIds,
        sessionMemberIds
      ),
    [
      sessions,
      otherRooms,
      localJoinedIds,
      hostedIds,
      remoteJoinedIds,
      sessionMemberIds,
    ]
  )
  const joinedRooms = React.useMemo(
    () => joinedSessions.map((s) => roomForViewer(s, courts)),
    [joinedSessions, courts]
  )
  const committedSessions = React.useMemo(
    () =>
      deriveCommittedSessions(
        sessions,
        otherRooms,
        identity.userInitials,
        authUser.id
      ),
    [sessions, otherRooms, identity.userInitials, authUser.id]
  )
  const activeSession = React.useMemo(
    () => deriveActiveSession(joinedSessions, activeSessionId),
    [joinedSessions, activeSessionId]
  )
  const activeRoom = React.useMemo(
    () => (activeSession ? roomForViewer(activeSession, courts) : null),
    [activeSession, courts]
  )
  const bookings = React.useMemo(
    () => deriveBookings(sessions, courts),
    [sessions, courts]
  )
  const hostedCount = React.useMemo(
    () => hostedRoomCount(sessions, identity.userInitials),
    [sessions, identity.userInitials]
  )

  const isSuitable = React.useCallback(
    (room: MatchRoom) => isRoomSuitable(room, joinedIds),
    [joinedIds]
  )
  const hasTimeConflict = React.useCallback(
    (room: MatchRoom) =>
      overlappingCommitment(room, sessions, otherRooms, committedSessions) !==
      null,
    [sessions, otherRooms, committedSessions]
  )
  const overlappingFor = React.useCallback(
    (room: MatchRoom): PlaySession | null =>
      overlappingCommitment(room, sessions, otherRooms, committedSessions),
    [sessions, otherRooms, committedSessions]
  )

  return {
    ...identity,
    sessions,
    otherRooms,
    expiredEvents,
    rooms,
    joinedRooms,
    joinedSessions,
    joinedIds,
    requestedIds,
    hostedIds,
    hostedRoomCount: hostedCount,
    maxHostedRooms: MAX_HOSTED_ROOMS,
    canHostMore: hostedCount < MAX_HOSTED_ROOMS,
    activeRoom,
    activeSession,
    activeRoomId: activeSession?.id ?? null,
    bookings,
    isSuitable,
    hasTimeConflict,
    overlappingFor,
  }
}
