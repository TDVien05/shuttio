import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"

import { queryKeys } from "@/lib/query-keys"
import type { PlaySession } from "@/lib/shared"
import {
  listPlayerSessions,
  saveSession,
} from "@/features/play/api/session-api"
import {
  decideRoomRequest,
  disbandRoom,
  leaveRoomMembership,
  listRooms,
  requestJoinRoom,
} from "@/features/play/api/rooms-api"
import { cancelBookingRecord } from "@/features/booking/api/booking-api"
import { wellFormedRooms } from "@/features/play/lib/matchmaking-derive"

/** Reads owned by the player's sessions and the cross-user room pool. */
export const sessionQueries = {
  /** My persisted sessions, with booking-derived status from the server. */
  mine: () =>
    queryOptions({
      queryKey: queryKeys.sessions(),
      queryFn: ({ signal }) => listPlayerSessions(signal),
    }),

  /**
   * Every other signed-in user's listed room. Polling stays as the fallback
   * when Centrifugo is unavailable; the realtime channel invalidates it too.
   */
  rooms: () =>
    queryOptions({
      queryKey: queryKeys.rooms(),
      queryFn: async ({ signal }) =>
        wellFormedRooms(await listRooms(signal)),
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    }),
}

export function upsertSession(
  sessions: PlaySession[] | undefined,
  next: PlaySession
): PlaySession[] | undefined {
  if (!sessions) return [next]
  return sessions.some((s) => s.id === next.id)
    ? sessions.map((s) => (s.id === next.id ? next : s))
    : [next, ...sessions]
}

function removeSession(
  sessions: PlaySession[] | undefined,
  id: string
): PlaySession[] | undefined {
  return sessions?.filter((s) => s.id !== id)
}

/**
 * Persist one of my sessions. The cache updates optimistically while the API
 * call is in flight, rolls back on a rejected write, and refetches on settle so
 * the server's derived booking fields win.
 */
export function useSaveSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (session: PlaySession) => saveSession(session),

    onMutate: async (session) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.sessions() })
      const previous = queryClient.getQueryData<PlaySession[]>(
        queryKeys.sessions()
      )
      queryClient.setQueryData<PlaySession[]>(queryKeys.sessions(), (current) =>
        upsertSession(current, session)
      )
      return { previous }
    },

    onError: (_error, _session, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.sessions(), context.previous)
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions() })
    },
  })
}

/** Persist a session without touching the cache (fire-and-forget side flows). */
export function usePersistSession() {
  return useMutation({
    mutationFn: (session: PlaySession) => saveSession(session),
  })
}

/** Ask to join another user's room; the host's doc is the source of truth. */
export function useRequestJoinRoom() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (roomId: string) => requestJoinRoom(roomId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.rooms() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions() })
    },
  })
}

/** Host approves/declines a request; invalidate both the host and browse pool. */
export function useDecideRoomRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      roomId,
      targetUserId,
      decision,
    }: {
      roomId: string
      targetUserId: string
      decision: "approve" | "decline"
    }) => decideRoomRequest(roomId, targetUserId, decision),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.rooms() })
    },
  })
}

/** Host disbands their own room (or a booked room is delisted). */
export function useDisbandRoom() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (roomId: string) => disbandRoom(roomId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.rooms() })
    },
  })
}

/** A member leaves someone else's room. */
export function useLeaveRoomMembership() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (roomId: string) => leaveRoomMembership(roomId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.rooms() })
    },
  })
}

/** Drop my own session draft (a disbanded forming room). */
export function useForgetSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (sessionId: string) => {
      queryClient.setQueryData<PlaySession[]>(
        queryKeys.sessions(),
        (current) => removeSession(current, sessionId)
      )
    },
  })
}

/** Cancel the linked booking record (refund policy lives on the server). */
export function useCancelBookingRecord() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (bookingId: string) => cancelBookingRecord(bookingId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.seed() })
    },
  })
}
