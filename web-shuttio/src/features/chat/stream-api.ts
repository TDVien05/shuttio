import { api } from "@/lib/api"
import { roomChannelId } from "@/features/chat/channel-ids"

// ── Real room-chat lifecycle (quyết định #13) ────────────────────────────
// Only the room's real members are ever added — no mock seeding — every
// mutation authorized against the channel's `created_by` (the host) on the
// api side. Failures here are always best-effort from the caller's side — a
// chat hiccup must never block a matchmaking/booking decision. The old
// `ensureRoomChannel` (`POST /api/stream/channels`, mock-seeded invitees) was
// removed in Phase 9 — a room's chat is created host-only by `createRoomChat`
// the moment the room exists; real members are added/removed by the api
// itself as part of deciding a join request or a member leaving (Phase 9 G2,
// `api/src/features/rooms/`), not by the web calling these directly for that
// flow anymore.

/** Create a room's real chat with only the host as a member — never mocks. */
export async function createRoomChat(input: {
  roomId: string
  name: string
}): Promise<{ id: string }> {
  return api<{ id: string }>("/api/stream/rooms", {
    method: "POST",
    body: { id: roomChannelId(input.roomId), name: input.name },
  })
}

/** Host adds a real (non-mock) member to their room's chat — e.g. on approve. */
export async function addRoomMember(input: {
  roomId: string
  memberId: string
}): Promise<void> {
  await api("/api/stream/rooms/members", {
    method: "POST",
    body: { channelId: roomChannelId(input.roomId), memberId: input.memberId },
  })
}

/** Remove a member — host kick/decline, or a member leaving themselves. */
export async function removeRoomMember(input: {
  roomId: string
  memberId: string
}): Promise<void> {
  await api("/api/stream/rooms/members", {
    method: "DELETE",
    body: { channelId: roomChannelId(input.roomId), memberId: input.memberId },
  })
}

/** Host freezes their room's chat on cancel — keeps history, blocks sends. */
export async function freezeRoomChat(roomId: string): Promise<void> {
  await api("/api/stream/rooms/freeze", {
    method: "POST",
    body: { channelId: roomChannelId(roomId) },
  })
}

// ── Community chat: user search, DMs/groups, venue chat ──────────────────

export interface FoundUser {
  id: string
  name: string
  image?: string
  /** Present only when the search query was an exact email match. */
  email?: string
}

/** Find real users by name (partial) or email (exact). */
export async function searchUsers(q: string): Promise<FoundUser[]> {
  return api<FoundUser[]>(`/api/stream/users/search?q=${encodeURIComponent(q)}`)
}

/** Start a DM (one member) or a named group chat (2+). Returns the channel id. */
export async function createConversation(input: {
  memberIds: string[]
  name?: string
}): Promise<{ id: string }> {
  return api<{ id: string }>("/api/stream/conversations", {
    method: "POST",
    body: input,
  })
}

/**
 * Leave a group / delete a DM for the caller — removes the conversation from
 * their list. A group is left (others keep it); a DM is hidden with the
 * caller's history cleared (the other side is untouched). The api decides
 * which from the channel's membership; see `StreamService.leaveConversation`.
 */
export async function leaveConversation(channelId: string): Promise<void> {
  await api("/api/stream/conversations", {
    method: "DELETE",
    body: { channelId },
  })
}

/** Open the caller's chat with a venue (needs a completed booking there). */
export async function openVenueChat(input: {
  venueId?: string
  bookingId?: string
}): Promise<{ id: string }> {
  return api<{ id: string }>("/api/stream/venue-chats", {
    method: "POST",
    body: input,
  })
}
