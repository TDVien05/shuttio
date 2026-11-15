import type {
  AttendanceMark,
  LeaveRoomResult,
  PlaySession,
  ReliabilitySummary,
} from "@/lib/shared"

import { api, apiResult } from "@/lib/api"
import type { ApiResult } from "@/lib/api"

// Client calls for the cross-user room-coordination API (Phase 9 G2,
// VienTD-Review decision #16 — `api/src/features/rooms/`). Distinct from the
// per-owner `sessions` collection (`session-api.ts`): `GET /api/rooms`
// browses every *other* signed-in user's listed room too, and the mutations
// below target another user's document directly — the requester's join
// request, the host's approve/decline, a member leaving on their own.
//
// Like `booking-api.ts`, these return an `ApiResult` so callers can branch on
// the HTTP status (e.g. a 409 — room full/closed, request already decided);
// `message` is the API's own (Vietnamese) `AllExceptionsFilter` text, safe to
// surface directly in a toast.

export type RoomActionResult<T> = ApiResult<T>

/**
 * Every listed, non-demo, still-open room across every signed-in user —
 * `sessionQueries.rooms()` owns the cache, with polling as the offline
 * fallback behind `rooms:changes`. It is the source of truth for rooms the
 * caller joined outside their own session doc, and for browsing rooms other
 * players host.
 */
export async function listRooms(signal?: AbortSignal): Promise<PlaySession[]> {
  return api<PlaySession[]>("/api/rooms", { signal })
}

/** Ask to join someone else's room — takes a `requested` seat pending the host. */
export async function requestJoinRoom(
  roomId: string
): Promise<RoomActionResult<void>> {
  return apiResult<void>(`/api/rooms/${encodeURIComponent(roomId)}/requests`, {
    method: "POST",
  })
}

/** The room host's decision on a pending join request. */
export async function decideRoomRequest(
  roomId: string,
  targetUserId: string,
  decision: "approve" | "decline"
): Promise<RoomActionResult<void>> {
  return apiResult<void>(
    `/api/rooms/${encodeURIComponent(roomId)}/requests/${encodeURIComponent(targetUserId)}`,
    { method: "PUT", body: { decision } }
  )
}

/** The host cancels their room — removed for everyone, members notified. */
export async function disbandRoom(
  roomId: string
): Promise<RoomActionResult<void>> {
  return apiResult<void>(`/api/rooms/${encodeURIComponent(roomId)}`, {
    method: "DELETE",
  })
}

/**
 * A confirmed (non-host) member leaves someone else's room. Free unless they've
 * paid toward the court: then it only files a request (`status: "requested"`)
 * the host must approve, and they stay in the room meanwhile.
 */
export async function leaveRoomMembership(
  roomId: string
): Promise<RoomActionResult<LeaveRoomResult>> {
  return apiResult<LeaveRoomResult>(
    `/api/rooms/${encodeURIComponent(roomId)}/members/me`,
    {
      method: "DELETE",
    }
  )
}

/** Host confirms a member has paid their court share. */
export async function markSharePaid(
  roomId: string,
  memberUserId: string
): Promise<RoomActionResult<void>> {
  return apiResult<void>(
    `/api/rooms/${encodeURIComponent(roomId)}/members/${encodeURIComponent(memberUserId)}/paid`,
    { method: "PUT" }
  )
}

/** Host sends a payment reminder notification to a member. */
export async function remindSharePayment(
  roomId: string,
  memberUserId: string
): Promise<RoomActionResult<void>> {
  return apiResult<void>(
    `/api/rooms/${encodeURIComponent(roomId)}/members/${encodeURIComponent(memberUserId)}/remind`,
    { method: "POST" }
  )
}

// ── Self-booked rooms (`courtMode: "self"`) ──────────────────────────────────

/** Host says the court is booked with the venue ("Đã chốt sân"). */
export async function confirmSelfCourt(
  roomId: string
): Promise<RoomActionResult<void>> {
  return apiResult<void>(
    `/api/rooms/${encodeURIComponent(roomId)}/court-confirmed`,
    { method: "PUT" }
  )
}

/** Check in on site — the server measures the position against the pinned court. */
export async function checkInRoom(
  roomId: string,
  position: { lat: number; lng: number; accuracy?: number }
): Promise<RoomActionResult<AttendanceMark>> {
  return apiResult<AttendanceMark>(
    `/api/rooms/${encodeURIComponent(roomId)}/check-in`,
    { method: "POST", body: position }
  )
}

/** A player who is there confirms another seat holder came. */
export async function vouchAttendance(
  roomId: string,
  userId: string
): Promise<RoomActionResult<void>> {
  return apiResult<void>(
    `/api/rooms/${encodeURIComponent(roomId)}/attendance/${encodeURIComponent(userId)}`,
    { method: "POST" }
  )
}

/** Any player's show-up record. */
export async function getReliability(
  userId: string
): Promise<ReliabilitySummary> {
  return api<ReliabilitySummary>(
    `/api/reliability/${encodeURIComponent(userId)}`
  )
}
