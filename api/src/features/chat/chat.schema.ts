import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import type { HydratedDocument } from "mongoose"

import type { ChatChannelKind } from "../../shared/index.js"

// Chat storage. Messages, channels and per-member read state live in MongoDB;
// Centrifugo only delivers the realtime nudges (see `chat-events.service.ts`).
// Explicit `type: X` on every field — tsx-based runners don't emit the
// design:type metadata `@Prop()` needs (same note as `notification.schema.ts`).

/** A conversation. Its `channelId` follows the id conventions in `chat.ids.ts`. */
@Schema({ timestamps: true })
export class ChatChannel {
  @Prop({ type: String, required: true, unique: true }) channelId: string
  @Prop({ type: String, required: true }) kind: ChatChannelKind
  /** Group / room / venue title; unset on a DM. */
  @Prop({ type: String }) name?: string
  @Prop({ type: String, required: true }) createdBy: string
  /** Owning venue of a player↔venue chat (absent on all other chats). */
  @Prop({ type: String, index: true }) venueId?: string
  /** Owning brand of a player↔venue chat, when the venue belongs to one. */
  @Prop({ type: String, index: true }) brandId?: string
  /** No new messages can be sent; history stays readable. */
  @Prop({ type: Boolean, default: false }) frozen: boolean
  @Prop({ type: Date }) lastMessageAt?: Date
  @Prop({
    type: { senderId: String, text: String, hasImage: Boolean },
    _id: false,
  })
  lastMessage?: { senderId: string; text: string; hasImage: boolean }
}

export type ChatChannelDocument = HydratedDocument<ChatChannel>
export const ChatChannelSchema = SchemaFactory.createForClass(ChatChannel)

/** One user's membership of a conversation, with their own read/clear state. */
@Schema({ timestamps: true })
export class ChatMember {
  @Prop({ type: String, required: true }) channelId: string
  @Prop({ type: String, required: true }) userId: string
  /** Messages at or before this are read. Starts at join time. */
  @Prop({ type: Date, required: true }) lastReadAt: Date
  /** "Delete for me": history before this is hidden from this member. */
  @Prop({ type: Date }) clearedAt?: Date
  /** Removed from this member's list until the next message arrives. */
  @Prop({ type: Boolean, default: false }) hidden: boolean
}

export type ChatMemberDocument = HydratedDocument<ChatMember>
export const ChatMemberSchema = SchemaFactory.createForClass(ChatMember)
ChatMemberSchema.index({ channelId: 1, userId: 1 }, { unique: true })
// "My conversations" — the query behind every channel-list load.
ChatMemberSchema.index({ userId: 1 })

/** A picture on a message, as stored: a private Cloudinary asset, or a pass-through URL. */
export interface ChatMessageImage {
  /** Private (authenticated) Cloudinary asset; the URL is signed on the way out. */
  publicId?: string
  version?: number
  format?: string
  width?: number
  height?: number
  /** A ready-made URL instead of `publicId` (booking proof screenshots). */
  url?: string
}

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class ChatMessage {
  @Prop({ type: String, required: true }) channelId: string
  @Prop({ type: String, required: true }) senderId: string
  @Prop({ type: String, default: "" }) text: string
  @Prop({
    type: {
      publicId: String,
      version: Number,
      format: String,
      width: Number,
      height: Number,
      url: String,
    },
    _id: false,
  })
  image?: ChatMessageImage
  @Prop({ type: Boolean }) system?: boolean
}

export type ChatMessageDocument = HydratedDocument<ChatMessage>
export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage)
// History paging and unread counts: newest-first within a channel.
ChatMessageSchema.index({ channelId: 1, createdAt: -1 })
