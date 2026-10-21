import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"

import type { ApiResult } from "@/lib/api"
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
  markSharePaid,
  requestJoinRoom,
} from "@/features/play/api/rooms-api"
import { cancelBookingRecord } from "@/features/booking/api/booking-api"
import { wellFormedRooms } from "@/features/play/lib/matchmaking-derive"

/** A rejected room/booking action, carrying the HTTP status to branch on. */
export class RoomActionError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = "RoomActionError"
  }
}

function unwrap<T>(result: ApiResult<T>): T {
  if (!result.ok) throw new RoomActionError(result.status, result.message)
  return result.data
}

/** Reads owned by the player's sessions and the cross-user room pool. */
export const sessionQueries = {
  /** My persisted sessions, with booking-derived status from the server. */
  mine: () =>
    queryOptions({
      queryKey: queryKeys.sessions(),
      queryFn: ({ signal }) => listPlayerSessions(signal),
      // The layout's seed already carries the same sessions, so a mounted
      // query can start from that snapshot without an immediate refetch.
      staleTime: 30_000,
      // Polling is the offline fallback for the personal sessions channel.
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    }),

  /**
   * Every other signed-in user's listed room. Polling stays as the fallback
   * when Centrifugo is unavailable; the realtime channel invalidates it too.
   */
  rooms: () =>
    queryOptions({
      queryKey: queryKeys.rooms(),
      queryFn: async ({ signal }) => wellFormedRooms(await listRooms(signal)),
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
      // 1. Stop an in-flight read from overwriting the optimistic view.
      await queryClient.cancelQueries({ queryKey: queryKeys.sessions() })
      // 2. Snapshot the cache so a rejected write can restore it.
      const previous = queryClient.getQueryData<PlaySession[]>(
        queryKeys.sessions()
      )
      // 3. Write the optimistic insert/replacement.
      queryClient.setQueryData<PlaySession[]>(queryKeys.sessions(), (current) =>
        upsertSession(current, session)
      )
      // 4. Hand the snapshot to onError.
      return { previous }
    },

    onError: (_error, _session, context) => {
      if (context) {
        queryClient.setQueryData(queryKeys.sessions(), context.previous)
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions() })
    },
  })
}

/** Ask to join another user's room; the host's doc is the source of truth. */
export interface JoinRoomInput {
  roomId: string
  userId: string
  userName: string
  initials: string
  /** Event time for the request's TTL clock. */
  at: number
}

/** Add my pending seat to one room, unless I'm already on its roster. */
function addJoinRequest(room: PlaySession, input: JoinRoomInput): PlaySession {
  if (room.roster.some((player) => player.userId === input.userId)) return room
  return {
    ...room,
    roster: [
      ...room.roster,
      {
        name: input.userName,
        initials: input.initials,
        rsvp: "requested",
        rsvpAt: input.at,
        userId: input.userId,
      },
    ],
  }
}

/**
 * Apply my join request to the cached browse pool, leaving every other room
 * untouched. Pure so the optimistic view can be unit-tested.
 */
export function applyJoinRequest(
  rooms: PlaySession[] | undefined,
  input: JoinRoomInput
): PlaySession[] | undefined {
  return rooms?.map((room) =>
    room.id === input.roomId ? addJoinRequest(room, input) : room
  )
}

export function useRequestJoinRoom() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: JoinRoomInput) =>
      unwrap(await requestJoinRoom(input.roomId)),

    onMutate: async (input) => {
      // 1. Stop an in-flight browse-pool read from overwriting the view.
      await queryClient.cancelQueries({ queryKey: queryKeys.rooms() })
      // 2. Snapshot the cache so a rejected request can restore it.
      const previous = queryClient.getQueryData<PlaySession[]>(
        queryKeys.rooms()
      )
      // 3. Write my optimistic pending seat.
      queryClient.setQueryData<PlaySession[]>(queryKeys.rooms(), (rooms) =>
        applyJoinRequest(rooms, input)
      )
      // 4. Hand the snapshot to onError.
      return { previous }
    },

    onError: (_error, _input, context) => {
      if (context) {
        queryClient.setQueryData(queryKeys.rooms(), context.previous)
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.rooms() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions() })
    },
  })
}

/** Host approves/declines a request; invalidate both the host and browse pool. */
export interface DecideRoomRequestInput {
  roomId: string
  targetUserId: string
  decision: "approve" | "decline"
}

/** Approve one request: the target member's seat becomes confirmed. */
function approveRoomSeat(
  session: PlaySession,
  targetUserId: string
): PlaySession {
  return {
    ...session,
    roster: session.roster.map((player) =>
      player.userId === targetUserId ? { ...player, rsvp: "going" } : player
    ),
  }
}

/** Decline one request: the target member leaves the roster. */
function declineRoomSeat(
  session: PlaySession,
  targetUserId: string
): PlaySession {
  return {
    ...session,
    roster: session.roster.filter((player) => player.userId !== targetUserId),
  }
}

/**
 * Apply a host's decision to the cached sessions, leaving every other room
 * untouched. Pure so the optimistic view can be unit-tested independently of
 * the mutation lifecycle.
 */
export function applyRoomDecision(
  sessions: PlaySession[] | undefined,
  input: DecideRoomRequestInput
): PlaySession[] | undefined {
  return sessions?.map((session) => {
    if (session.id !== input.roomId) return session
    return input.decision === "approve"
      ? approveRoomSeat(session, input.targetUserId)
      : declineRoomSeat(session, input.targetUserId)
  })
}

export function useDecideRoomRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: DecideRoomRequestInput) =>
      unwrap(
        await decideRoomRequest(
          input.roomId,
          input.targetUserId,
          input.decision
        )
      ),

    onMutate: async (input) => {
      // 1. Stop an in-flight read from overwriting the optimistic view.
      await queryClient.cancelQueries({ queryKey: queryKeys.sessions() })
      // 2. Snapshot the cache so a rejected decision can restore it.
      const previous = queryClient.getQueryData<PlaySession[]>(
        queryKeys.sessions()
      )
      // 3. Write the optimistic approval/removal for the target room.
      queryClient.setQueryData<PlaySession[]>(
        queryKeys.sessions(),
        (sessions) => applyRoomDecision(sessions, input)
      )
      // 4. Hand the snapshot to onError.
      return { previous }
    },

    onError: (_error, _input, context) => {
      if (context) {
        queryClient.setQueryData(queryKeys.sessions(), context.previous)
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.rooms() })
    },
  })
}

/**
 * Host records that a member has paid their share. Waits for the API before
 * refreshing both room projections; the server's `paid` flag is the source of
 * truth, so no component-local override can mask a later refetch.
 */
export interface MarkSharePaidInput {
  roomId: string
  memberUserId: string
}

export function useMarkSharePaid() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: MarkSharePaidInput) =>
      unwrap(await markSharePaid(input.roomId, input.memberUserId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.rooms() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions() })
    },
  })
}

/** Host disbands their own room (or a booked room is delisted). */
export function useDisbandRoom() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (roomId: string) => unwrap(await disbandRoom(roomId)),
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
    mutationFn: async (roomId: string) =>
      unwrap(await leaveRoomMembership(roomId)),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.rooms() })
    },
  })
}

/** Cancel the linked booking record (refund policy lives on the server). */
export function useCancelBookingRecord() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (bookingId: string) =>
      unwrap(await cancelBookingRecord(bookingId)),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.seed() })
    },
  })
}
