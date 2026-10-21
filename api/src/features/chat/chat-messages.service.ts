import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { isValidObjectId, type Model } from "mongoose"

import type {
  ChatImageRef,
  ChatImageUploadSignature,
  ChatMessage as ChatMessageDto,
} from "../../shared/index.js"
import { ClerkDirectoryService } from "../directory/clerk-directory.service.js"
import { NotificationsService } from "../notifications/notifications.service.js"
import { ChatEventsService } from "./chat-events.service.js"
import { ChatImagesService } from "./chat-images.service.js"
import {
  ChatChannel,
  ChatMember,
  ChatMessage,
  type ChatChannelDocument,
  type ChatMemberDocument,
  type ChatMessageDocument,
  type ChatMessageImage,
} from "./chat.schema.js"

export const MAX_MESSAGE_LENGTH = 2000
export const DEFAULT_PAGE_SIZE = 30
export const MAX_PAGE_SIZE = 50

interface LeanMessage {
  _id: { toString(): string }
  channelId: string
  senderId: string
  text?: string
  image?: ChatMessageImage
  system?: boolean
  createdAt: Date
}

/** Sending and reading messages. Channel/membership rules live in `ChatService`. */
@Injectable()
export class ChatMessagesService {
  private readonly logger = new Logger(ChatMessagesService.name)

  constructor(
    @InjectModel(ChatChannel.name)
    private readonly channels: Model<ChatChannelDocument>,
    @InjectModel(ChatMember.name)
    private readonly members: Model<ChatMemberDocument>,
    @InjectModel(ChatMessage.name)
    private readonly messages: Model<ChatMessageDocument>,
    @Inject(ChatEventsService) private readonly events: ChatEventsService,
    @Inject(ChatImagesService) private readonly images: ChatImagesService,
    @Inject(ClerkDirectoryService)
    private readonly directory: ClerkDirectoryService,
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService
  ) {}

  /**
   * Tell every other member about a player message: the bell (one row per
   * sender per window) and the digest email outbox. Best-effort, so a failure
   * here never fails the message itself.
   */
  private async notifyRecipients(
    channelId: string,
    senderId: string
  ): Promise<void> {
    try {
      const recipients = (await this.memberIds(channelId)).filter(
        (id) => id !== senderId
      )
      if (!recipients.length) return
      const senderName =
        (await this.directory.getOne(senderId))?.name ?? "Người chơi"
      for (const recipientId of recipients) {
        await this.notifications.recordChatMessage(recipientId, {
          channelId,
          senderId,
          senderName,
          href: "/app/chat",
        })
      }
    } catch (err) {
      this.logger.error(
        `Chat notification failed for ${channelId}: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  private toDto(doc: LeanMessage): ChatMessageDto {
    const image = this.images.deliver(doc.image)
    return {
      id: doc._id.toString(),
      channelId: doc.channelId,
      senderId: doc.senderId,
      text: doc.text ?? "",
      ...(image ? { image } : {}),
      ...(doc.system ? { system: true } : {}),
      createdAt: doc.createdAt.toISOString(),
    }
  }

  private async memberIds(channelId: string): Promise<string[]> {
    const rows = await this.members
      .find({ channelId })
      .select("userId")
      .lean<{ userId: string }[]>()
    return rows.map((r) => r.userId)
  }

  /** The caller's membership row, or 403 (404 when the channel doesn't exist). */
  private async assertMember(userId: string, channelId: string) {
    const member = await this.members
      .findOne({ channelId, userId })
      .lean<{ clearedAt?: Date }>()
    if (member) return member
    if (!(await this.channels.exists({ channelId }))) {
      throw new NotFoundException("Cuộc trò chuyện không tồn tại")
    }
    throw new ForbiddenException("Bạn không có trong cuộc trò chuyện này")
  }

  /** Signed params for the caller to upload a picture into this conversation. */
  async signImageUpload(
    userId: string,
    channelId: string
  ): Promise<ChatImageUploadSignature> {
    await this.assertMember(userId, channelId)
    return this.images.signUpload(channelId)
  }

  /** A member sends a message and/or a picture. Frozen chats refuse. */
  async send(
    userId: string,
    channelId: string,
    input: { text?: string; image?: ChatImageRef }
  ): Promise<ChatMessageDto> {
    const text = (input.text ?? "").trim()
    if (!text && !input.image) {
      throw new BadRequestException("Tin nhắn không được để trống")
    }
    await this.assertMember(userId, channelId)
    const channel = await this.channels
      .findOne({ channelId })
      .select("frozen")
      .lean<{ frozen?: boolean }>()
    if (channel?.frozen) {
      throw new ForbiddenException("Cuộc trò chuyện đã bị khoá")
    }
    const image = input.image
      ? this.images.toStored(channelId, input.image)
      : undefined
    return this.store(channelId, userId, text, image)
  }

  /**
   * Post on behalf of the platform (booking milestones) — no frozen check, and
   * the sender must still be a member. `imageUrl` is passed through as-is.
   */
  async sendSystem(
    channelId: string,
    senderId: string,
    text: string,
    imageUrl?: string
  ): Promise<ChatMessageDto> {
    await this.assertMember(senderId, channelId)
    return this.store(
      channelId,
      senderId,
      text,
      imageUrl ? { url: imageUrl } : undefined,
      true
    )
  }

  private async store(
    channelId: string,
    senderId: string,
    text: string,
    image: ChatMessageImage | undefined,
    system?: boolean
  ): Promise<ChatMessageDto> {
    const doc = await this.messages.create({
      channelId,
      senderId,
      text,
      ...(image ? { image } : {}),
      ...(system ? { system: true } : {}),
    })
    const createdAt = (doc as unknown as { createdAt: Date }).createdAt
    await this.channels.updateOne(
      { channelId },
      {
        $set: {
          lastMessageAt: createdAt,
          lastMessage: { senderId, text, hasImage: Boolean(image) },
        },
      }
    )
    // A new message brings a "deleted for me" conversation back, and the
    // sender has by definition read and received up to their own message.
    await this.members.updateMany({ channelId }, { $set: { hidden: false } })
    await this.members.updateOne(
      { channelId, userId: senderId },
      { $set: { lastReadAt: createdAt, lastDeliveredAt: createdAt } }
    )
    const dto = this.toDto({
      _id: doc._id,
      channelId,
      senderId,
      text,
      image,
      system,
      createdAt,
    })
    this.events.message(await this.memberIds(channelId), dto)
    if (!system) void this.notifyRecipients(channelId, senderId)
    return dto
  }

  /**
   * One page of history, oldest → newest, for a member. `before` is a message
   * id: the page ends just before it. Anything the caller cleared ("delete
   * for me") stays hidden.
   */
  async list(
    userId: string,
    channelId: string,
    opts: { before?: string; limit?: number }
  ): Promise<{ messages: ChatMessageDto[]; hasMore: boolean }> {
    const member = await this.assertMember(userId, channelId)
    const limit = Math.min(opts.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    if (opts.before && !isValidObjectId(opts.before)) {
      throw new BadRequestException("Mốc tin nhắn không hợp lệ")
    }
    const rows = await this.messages
      .find({
        channelId,
        ...(member.clearedAt ? { createdAt: { $gt: member.clearedAt } } : {}),
        ...(opts.before ? { _id: { $lt: opts.before } } : {}),
      })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean<LeanMessage[]>()
    return {
      messages: rows
        .slice(0, limit)
        .reverse()
        .map((r) => this.toDto(r)),
      hasMore: rows.length > limit,
    }
  }

  /** Mark everything in the conversation read for the caller. */
  async markRead(userId: string, channelId: string): Promise<void> {
    await this.assertMember(userId, channelId)
    const now = new Date()
    await this.members.updateOne(
      { channelId, userId },
      { $set: { lastReadAt: now, lastDeliveredAt: now } }
    )
    const memberIds = await this.memberIds(channelId)
    this.events.read(memberIds, channelId, userId, now.toISOString())
    // The caller's other tabs/devices refresh their unread badges.
    this.events.channelChanged([userId], channelId)
  }

  /** Mark messages in the conversation delivered to the caller's client. */
  async markDelivered(userId: string, channelId: string): Promise<void> {
    await this.assertMember(userId, channelId)
    const now = new Date()
    await this.members.updateOne(
      { channelId, userId },
      { $set: { lastDeliveredAt: now } }
    )
    const memberIds = await this.memberIds(channelId)
    this.events.delivered(memberIds, channelId, userId, now.toISOString())
  }
}
