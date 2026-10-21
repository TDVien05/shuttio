import { createHash } from "node:crypto"

import type { ChatChannelKind } from "../../shared/index.js"

// Channel-id conventions. The prefix tells the kind of conversation, and the
// player↔venue ids are deterministic so there's one thread per pair.
// web-shuttio/src/features/chat/lib/channel-ids.ts mirrors `roomChannelId`.

/** Upper bound on a community group's size (creator included). */
export const MAX_GROUP_MEMBERS = 16

/** Channel id for a room's real chat. */
export const roomChannelId = (roomId: string) => `room-${roomId}`

/** Deterministic DM channel id for a user pair (order-independent). */
export const dmChannelId = (a: string, b: string) =>
  `dm-${createHash("sha256").update([a, b].sort().join(":")).digest("hex").slice(0, 40)}`

/** Deterministic per-(player, venue) chat channel id. */
export const venueChannelId = (venueId: string, userId: string) =>
  `venue-${createHash("sha256").update(`${venueId}:${userId}`).digest("hex").slice(0, 40)}`

/**
 * Deterministic per-(player, brand) chat channel id — one chat with an owner
 * however many of their branches the player books. Shares the `venue-` prefix
 * (and hash space, keyed `brand:<id>`) so every venue-chat check still applies.
 */
export const brandChannelId = (brandId: string, userId: string) =>
  venueChannelId(`brand:${brandId}`, userId)

/** The kind a channel id implies. */
export function channelKindFromId(channelId: string): ChatChannelKind {
  if (channelId.startsWith("room-")) return "room"
  if (channelId.startsWith("venue-")) return "venue"
  if (channelId.startsWith("group-")) return "group"
  return "dm"
}

/**
 * A group conversation (vs a DM or a player↔venue chat): a community group,
 * a room chat, or any channel with 3+ members.
 */
export function isGroupChannel(
  channelId: string,
  membership: { memberIds: string[]; isVenueChat: boolean }
): boolean {
  if (membership.isVenueChat || channelId.startsWith("dm-")) return false
  return (
    channelId.startsWith("group-") ||
    channelId.startsWith("room-") ||
    membership.memberIds.length > 2
  )
}
