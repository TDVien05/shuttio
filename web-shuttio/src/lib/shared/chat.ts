// Chat wire types — what `/api/chat/*` returns and what the realtime
// `personal:chat#<userId>` channel publishes. Hand-kept in sync with
// api/src/shared/chat.ts.

/** What a conversation is: a 1:1, a named group, a match room, or a venue thread. */
export type ChatChannelKind = "dm" | "group" | "room" | "venue"

/** A conversation member as shown in the UI (resolved from Clerk). */
export interface ChatUser {
  id: string
  name: string
  image?: string
}

/** A picture on a message. Private: the URLs are signed and only ever handed to members. */
export interface ChatImage {
  url: string
  thumbUrl: string
  width?: number
  height?: number
}

export interface ChatMessage {
  id: string
  channelId: string
  senderId: string
  text: string
  image?: ChatImage
  /** Posted by the platform on a user's behalf (booking milestones). */
  system?: boolean
  /** ISO datetime. */
  createdAt: string
}

export interface ChatChannel {
  id: string
  kind: ChatChannelKind
  /** Group / room / venue title; null for a DM (titled by the other member). */
  name: string | null
  createdBy: string
  members: ChatUser[]
  venueId?: string
  brandId?: string
  /** No new messages can be sent (a cancelled room's chat). */
  frozen: boolean
  /** Messages from others the caller hasn't read (capped at 99). */
  unread: number
  lastMessage?: {
    senderId: string
    text: string
    hasImage: boolean
    createdAt: string
  }
  /** ISO datetime of the last activity — the list's sort key. */
  updatedAt: string
}

/** A picture already uploaded to Cloudinary, attached to a message being sent. */
export interface ChatImageRef {
  publicId: string
  version: number
  format: string
  width?: number
  height?: number
}

/** Signed params for one direct browser → Cloudinary upload of a chat picture. */
export interface ChatImageUploadSignature {
  cloudName: string
  apiKey: string
  timestamp: number
  folder: string
  allowedFormats: string
  /** Cloudinary delivery type; `authenticated` = signed URLs only. */
  type: "authenticated"
  signature: string
}

/** Published to a user's `personal:chat#<userId>` realtime channel. */
export type ChatEvent =
  | { type: "message"; channelId: string; message: ChatMessage }
  /** The channel list changed (created, renamed, membership, frozen, read, deleted). */
  | { type: "channel"; channelId: string }
