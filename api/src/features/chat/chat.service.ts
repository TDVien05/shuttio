import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { randomUUID } from "node:crypto"
import type { Model } from "mongoose"

import { isDuplicateKeyError } from "../../common/mongo-util.js"
import type {
  ChatChannel as ChatChannelDto,
  ChatChannelKind,
  ChatUser,
} from "../../shared/index.js"
import { Booking, type BookingDocument } from "../bookings/booking.schema.js"
import { Brand, type BrandDocument } from "../brands/brand.schema.js"
import { ClerkDirectoryService } from "../directory/clerk-directory.service.js"
import { Venue, type VenueDocument } from "../venues/venue.schema.js"
import { ChatEventsService } from "./chat-events.service.js"
import { ChatImagesService } from "./chat-images.service.js"
import {
  brandChannelId,
  channelKindFromId,
  dmChannelId,
  isGroupChannel,
  MAX_GROUP_MEMBERS,
  venueChannelId,
} from "./chat.ids.js"
import {
  ChatChannel,
  ChatMember,
  ChatMessage,
  type ChatChannelDocument,
  type ChatMemberDocument,
  type ChatMessageDocument,
} from "./chat.schema.js"

export {
  brandChannelId,
  dmChannelId,
  isGroupChannel,
  MAX_GROUP_MEMBERS,
  roomChannelId,
  venueChannelId,
} from "./chat.ids.js"

/** How long a resolved Clerk name/avatar is reused before asking Clerk again. */
const USER_CACHE_TTL_MS = 60_000
/** Cap on the unread badge ("99+"). */
const UNREAD_CAP = 99

interface LeanChannel {
  channelId: string
  kind: ChatChannelKind
  name?: string
  createdBy: string
  venueId?: string
  brandId?: string
  frozen?: boolean
  lastMessageAt?: Date
  lastMessage?: { senderId: string; text: string; hasImage: boolean }
  createdAt: Date
}

interface LeanMember {
  channelId: string
  userId: string
  lastReadAt: Date
  lastDeliveredAt?: Date
  clearedAt?: Date
  hidden?: boolean
}

const FALLBACK_NAME = "Người chơi"

/**
 * Conversations and who is in them: rooms, DMs, groups and player↔venue
 * threads. Stored in MongoDB; every mutation tells the affected users'
 * realtime channels to refetch their list. Messages live in
 * `ChatMessagesService`.
 */
@Injectable()
export class ChatService {
  private readonly userCache = new Map<string, { user: ChatUser; at: number }>()

  constructor(
    @InjectModel(ChatChannel.name)
    private readonly channels: Model<ChatChannelDocument>,
    @InjectModel(ChatMember.name)
    private readonly members: Model<ChatMemberDocument>,
    @InjectModel(ChatMessage.name)
    private readonly messages: Model<ChatMessageDocument>,
    @InjectModel(Venue.name) private readonly venues: Model<VenueDocument>,
    @InjectModel(Booking.name)
    private readonly bookings: Model<BookingDocument>,
    @InjectModel(Brand.name) private readonly brands: Model<BrandDocument>,
    @Inject(ClerkDirectoryService)
    private readonly directory: ClerkDirectoryService,
    @Inject(ChatEventsService) private readonly events: ChatEventsService,
    @Inject(ChatImagesService) private readonly images: ChatImagesService
  ) {}

  // ── Reading ──────────────────────────────────────────────────────────────

  /** Display names/avatars for `ids`, from a short-lived cache over Clerk. */
  private async resolveUsers(ids: string[]): Promise<Map<string, ChatUser>> {
    const now = Date.now()
    const out = new Map<string, ChatUser>()
    const missing: string[] = []
    for (const id of new Set(ids)) {
      const hit = this.userCache.get(id)
      if (hit && now - hit.at < USER_CACHE_TTL_MS) out.set(id, hit.user)
      else missing.push(id)
    }
    if (missing.length) {
      for (const u of await this.directory.getMany(missing)) {
        const user: ChatUser = {
          id: u.id,
          name: u.name,
          ...(u.image ? { image: u.image } : {}),
        }
        this.userCache.set(u.id, { user, at: now })
        out.set(u.id, user)
      }
    }
    // A deleted account (or a Clerk blip) still gets a placeholder.
    for (const id of ids) {
      if (!out.has(id)) out.set(id, { id, name: FALLBACK_NAME })
    }
    return out
  }

  /**
   * The caller's conversations, most recently active first. With `venueId`,
   * only that venue's player threads (and its brand's) — the operator inbox.
   */
  async listChannels(
    userId: string,
    venueId?: string
  ): Promise<ChatChannelDto[]> {
    const mine = await this.members
      .find({ userId, hidden: { $ne: true } })
      .lean<LeanMember[]>()
    if (!mine.length) return []

    let venueFilter: object = {}
    if (venueId) {
      const venue = await this.venues
        .findOne({ venueId })
        .select("brandId")
        .lean<{ brandId?: string }>()
      venueFilter = {
        $or: [
          { venueId },
          ...(venue?.brandId ? [{ brandId: venue.brandId }] : []),
        ],
      }
    }
    const ids = mine.map((m) => m.channelId)
    const channels = await this.channels
      .find({ channelId: { $in: ids }, ...venueFilter })
      .lean<LeanChannel[]>()
    if (!channels.length) return []

    const shownIds = channels.map((c) => c.channelId)
    const everyMember = await this.members
      .find({ channelId: { $in: shownIds } })
      .select("channelId userId lastReadAt lastDeliveredAt")
      .lean<
        Pick<
          LeanMember,
          "channelId" | "userId" | "lastReadAt" | "lastDeliveredAt"
        >[]
      >()
    const byChannel = new Map<string, string[]>()
    const readByChannel = new Map<string, Record<string, string>>()
    const deliveredByChannel = new Map<string, Record<string, string>>()
    for (const m of everyMember) {
      byChannel.set(m.channelId, [
        ...(byChannel.get(m.channelId) ?? []),
        m.userId,
      ])
      if (m.lastReadAt) {
        const map = readByChannel.get(m.channelId) ?? {}
        map[m.userId] = m.lastReadAt.toISOString()
        readByChannel.set(m.channelId, map)
      }
      if (m.lastDeliveredAt) {
        const map = deliveredByChannel.get(m.channelId) ?? {}
        map[m.userId] = m.lastDeliveredAt.toISOString()
        deliveredByChannel.set(m.channelId, map)
      }
    }
    const users = await this.resolveUsers(everyMember.map((m) => m.userId))
    const myState = new Map(mine.map((m) => [m.channelId, m]))

    const rows = await Promise.all(
      channels.map(async (c): Promise<ChatChannelDto> => {
        const state = myState.get(c.channelId)!
        const readFrom = new Date(
          Math.max(state.lastReadAt.getTime(), state.clearedAt?.getTime() ?? 0)
        )
        const unread = await this.messages.countDocuments(
          {
            channelId: c.channelId,
            senderId: { $ne: userId },
            createdAt: { $gt: readFrom },
          },
          { limit: UNREAD_CAP }
        )
        // A cleared conversation shows no preview until something new arrives.
        const visibleLast =
          c.lastMessage &&
          c.lastMessageAt &&
          (!state.clearedAt || c.lastMessageAt > state.clearedAt)
        return {
          id: c.channelId,
          kind: c.kind,
          name: c.name ?? null,
          createdBy: c.createdBy,
          members: (byChannel.get(c.channelId) ?? []).map((id) =>
            users.get(id)!
          ),
          ...(c.venueId ? { venueId: c.venueId } : {}),
          ...(c.brandId ? { brandId: c.brandId } : {}),
          frozen: Boolean(c.frozen),
          unread,
          ...(visibleLast
            ? {
                lastMessage: {
                  ...c.lastMessage!,
                  createdAt: c.lastMessageAt!.toISOString(),
                },
              }
            : {}),
          updatedAt: (c.lastMessageAt ?? c.createdAt).toISOString(),
          memberReadAt: readByChannel.get(c.channelId) ?? {},
          memberDeliveredAt: deliveredByChannel.get(c.channelId) ?? {},
        }
      })
    )
    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  // ── Low-level helpers ────────────────────────────────────────────────────

  /** Get-or-create a channel; an existing one is returned untouched. */
  private async ensureChannel(
    channelId: string,
    init: {
      kind: ChatChannelKind
      name?: string
      createdBy: string
      venueId?: string
      brandId?: string
    }
  ): Promise<LeanChannel> {
    const upsert = () =>
      this.channels
        .findOneAndUpdate(
          { channelId },
          { $setOnInsert: { channelId, frozen: false, ...init } },
          { upsert: true, new: true }
        )
        .lean<LeanChannel>()
    try {
      return await upsert()
    } catch (err) {
      // Two first requests racing on the unique index — the row exists now.
      if (!isDuplicateKeyError(err)) throw err
      return await upsert()
    }
  }

  /** Add members (no-op for existing ones). `reveal` un-hides them. */
  private async addMembers(
    channelId: string,
    userIds: string[],
    reveal: string[] = []
  ): Promise<void> {
    const now = new Date()
    const unique = [...new Set(userIds)]
    if (!unique.length) return
    await this.members.bulkWrite(
      unique.map((userId) => ({
        updateOne: {
          filter: { channelId, userId },
          update: {
            $setOnInsert: { channelId, userId, lastReadAt: now, hidden: false },
          },
          upsert: true,
        },
      }))
    )
    if (reveal.length) {
      await this.members.updateMany(
        { channelId, userId: { $in: reveal } },
        { $set: { hidden: false } }
      )
    }
  }

  private async memberIdsOf(channelId: string): Promise<string[]> {
    const rows = await this.members
      .find({ channelId })
      .select("userId")
      .lean<{ userId: string }[]>()
    return rows.map((r) => r.userId)
  }

  // ── Real room-chat lifecycle (quyết định #13) ───────────────────────────
  // Only real members are ever added, and every mutation is authorized
  // against the channel's creator (the host).

  /**
   * Create a room's chat with only the host as a member. Safe to call once per
   * room, right when it's created; re-opening is idempotent for the host.
   */
  async createRoomChannel(
    userId: string,
    input: { id: string; name: string }
  ): Promise<{ id: string }> {
    if (channelKindFromId(input.id) !== "room") {
      throw new BadRequestException("Mã phòng chat không hợp lệ")
    }
    const channel = await this.ensureChannel(input.id, {
      kind: "room",
      name: input.name,
      createdBy: userId,
    })
    if (channel.createdBy !== userId) {
      throw new ForbiddenException(
        "Chỉ chủ phòng mới có quyền thực hiện thao tác này"
      )
    }
    await this.addMembers(input.id, [userId])
    this.events.channelChanged([userId], input.id)
    return { id: input.id }
  }

  /**
   * Get-or-create THE chat between a player and a venue owner — one thread per
   * pair, however many bookings or branches there are. Booking milestones post
   * into it and the "message the venue" buttons open it.
   */
  async ensureBookingChannel(input: {
    playerId: string
    ownerId: string
    venueId: string
    brandId?: string
    name: string
  }): Promise<string> {
    const { playerId, ownerId, venueId, brandId } = input
    let id: string
    let name = input.name
    let retag = false

    if (!brandId) {
      id = venueChannelId(venueId, playerId)
    } else {
      // A brand's branches all share one owner, so the player gets ONE chat per
      // brand. Titled by the brand rather than whichever branch came first.
      const brand = await this.brands
        .findOne({ brandId })
        .select("info")
        .lean<{ info?: { name?: string } }>()
      name = brand?.info?.name ?? input.name
      const resolved = await this.resolveBrandChannel(brandId, playerId)
      id = resolved.id
      retag = resolved.existing
    }

    await this.ensureChannel(id, {
      kind: "venue",
      name,
      createdBy: playerId,
      venueId,
      ...(brandId ? { brandId } : {}),
    })
    // A reused pre-brand (per-branch) chat: tag it with the brand so the
    // operator inbox of every branch finds it, and retitle it by the brand.
    if (retag) {
      await this.channels.updateOne(
        { channelId: id },
        { $set: { brandId, name } }
      )
    }
    await this.addMembers(id, [playerId, ownerId])
    this.events.channelChanged([playerId, ownerId], id)
    return id
  }

  /** The creator (host) of a channel, or 404. */
  private async channelOwner(channelId: string): Promise<string> {
    const channel = await this.channels
      .findOne({ channelId })
      .select("createdBy")
      .lean<{ createdBy: string }>()
    if (!channel) throw new NotFoundException("Phòng chat không tồn tại")
    return channel.createdBy
  }

  /** Throws unless `userId` is the room's host (the channel's creator). */
  private async assertHost(userId: string, channelId: string): Promise<void> {
    if ((await this.channelOwner(channelId)) !== userId) {
      throw new ForbiddenException(
        "Chỉ chủ phòng mới có quyền thực hiện thao tác này"
      )
    }
  }

  /** Host adds a real member to a room's chat — e.g. on approve. */
  async addRoomMember(
    userId: string,
    channelId: string,
    memberId: string
  ): Promise<void> {
    await this.assertHost(userId, channelId)
    await this.addMembers(channelId, [memberId])
    this.events.channelChanged(await this.memberIdsOf(channelId), channelId)
  }

  /**
   * Remove a member from a room's chat — kick/decline (host-only) or a member
   * leaving on their own (always allowed to remove themselves).
   */
  async removeRoomMember(
    userId: string,
    channelId: string,
    memberId: string
  ): Promise<void> {
    if (memberId !== userId) await this.assertHost(userId, channelId)
    else await this.channelOwner(channelId)
    const before = await this.memberIdsOf(channelId)
    await this.members.deleteOne({ channelId, userId: memberId })
    this.events.channelChanged(before, channelId)
  }

  /** Host freezes their room's chat (cancel) — keeps history, blocks sends. */
  async freezeRoomChannel(userId: string, channelId: string): Promise<void> {
    await this.assertHost(userId, channelId)
    await this.freezeChannelById(channelId)
  }

  /**
   * System-initiated freeze with no caller to authorize — used by the venue
   * cancel/decline hook. Best-effort from the caller's side: never let a chat
   * failure block a booking decision.
   */
  async freezeChannelById(channelId: string): Promise<void> {
    const res = await this.channels.updateOne(
      { channelId },
      { $set: { frozen: true } }
    )
    if (!res.matchedCount) {
      throw new NotFoundException("Phòng chat không tồn tại")
    }
    this.events.channelChanged(await this.memberIdsOf(channelId), channelId)
  }

  // ── Group management (rename / add members) ─────────────────────────────
  // Shared by community groups (`group-*`) and room chats (`room-*`). Room
  // membership itself still flows through `RoomsService`; only community
  // groups take members added directly here.

  /**
   * A channel's creator, member ids and kind — the one read every group
   * mutation authorizes against. Throws 404 for an unknown channel.
   */
  async channelMembership(channelId: string): Promise<{
    createdBy: string | null
    memberIds: string[]
    isVenueChat: boolean
  }> {
    const channel = await this.channels
      .findOne({ channelId })
      .select("createdBy venueId")
      .lean<{ createdBy?: string; venueId?: string }>()
    if (!channel) throw new NotFoundException("Cuộc trò chuyện không tồn tại")
    return {
      createdBy: channel.createdBy ?? null,
      memberIds: await this.memberIdsOf(channelId),
      isVenueChat: Boolean(channel.venueId),
    }
  }

  /** {@link channelMembership}, throwing 403 unless `userId` is a member. */
  async assertMember(userId: string, channelId: string) {
    const membership = await this.channelMembership(channelId)
    if (!membership.memberIds.includes(userId)) {
      throw new ForbiddenException("Bạn không có trong cuộc trò chuyện này")
    }
    return membership
  }

  /**
   * Rename a group chat. Any member may (Messenger/Zalo-style); DMs and venue
   * chats have no editable name — they're titled by the other party.
   */
  async renameGroup(
    userId: string,
    channelId: string,
    name: string
  ): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) throw new BadRequestException("Tên nhóm không được để trống")
    const membership = await this.assertMember(userId, channelId)
    if (!isGroupChannel(channelId, membership)) {
      throw new BadRequestException("Chỉ có thể đổi tên nhóm trò chuyện")
    }
    await this.channels.updateOne({ channelId }, { $set: { name: trimmed } })
    this.events.channelChanged(membership.memberIds, channelId)
  }

  /**
   * Add real users to a community group — the group's creator only. Room
   * chats are excluded: their members come from the room roster (join request
   * → host approval), which this would bypass.
   */
  async addGroupMembers(
    userId: string,
    channelId: string,
    memberIds: string[]
  ): Promise<void> {
    if (!channelId.startsWith("group-")) {
      throw new BadRequestException(
        "Chỉ có thể thêm thành viên vào nhóm trò chuyện"
      )
    }
    const membership = await this.channelMembership(channelId)
    if (membership.createdBy !== userId) {
      throw new ForbiddenException("Chỉ chủ nhóm mới có quyền thêm thành viên")
    }
    const ids = [...new Set(memberIds)].filter(
      (id) => !membership.memberIds.includes(id)
    )
    if (!ids.length) return
    if (membership.memberIds.length + ids.length > MAX_GROUP_MEMBERS) {
      throw new BadRequestException(
        `Nhóm tối đa ${MAX_GROUP_MEMBERS} thành viên`
      )
    }
    const users = await this.directory.getMany(ids)
    if (users.length !== ids.length) {
      throw new NotFoundException("Không tìm thấy người dùng")
    }
    await this.addMembers(channelId, ids)
    this.events.channelChanged([...membership.memberIds, ...ids], channelId)
  }

  /**
   * Delete a group chat for everyone. Unlike {@link leaveConversation} (the
   * caller alone drops out), this removes the channel and its history for
   * every member. Allowed for a community group's creator, or for whoever is
   * the last member left in a group or room chat. A room chat otherwise
   * follows its play room, so its host can't delete it while others are in it.
   */
  async deleteGroup(userId: string, channelId: string): Promise<void> {
    const isRoomChat = channelId.startsWith("room-")
    if (!channelId.startsWith("group-") && !isRoomChat) {
      throw new BadRequestException("Chỉ có thể xoá nhóm trò chuyện")
    }
    const membership = await this.channelMembership(channelId)
    const lastMember =
      membership.memberIds.length === 1 && membership.memberIds[0] === userId
    if (isRoomChat && !lastMember) {
      throw new ForbiddenException(
        "Chỉ có thể xoá nhóm phòng khi bạn là thành viên cuối cùng"
      )
    }
    if (!isRoomChat && membership.createdBy !== userId && !lastMember) {
      throw new ForbiddenException("Chỉ chủ nhóm mới có quyền xoá nhóm")
    }
    const pictures = await this.messages
      .find({ channelId, "image.publicId": { $exists: true } })
      .select("image.publicId")
      .lean<{ image?: { publicId?: string } }[]>()
    await this.messages.deleteMany({ channelId })
    await this.members.deleteMany({ channelId })
    await this.channels.deleteOne({ channelId })
    this.events.channelChanged(membership.memberIds, channelId)
    void this.images.destroy(
      pictures.flatMap((p) => (p.image?.publicId ? [p.image.publicId] : []))
    )
  }

  // ── Community chat: DMs/groups + venue chat ──────────────────────────────

  /**
   * Start (or reopen) a DM with one other user, or a named group chat with
   * several. Get-or-create, so calling this again with the same member lands in
   * the same DM.
   */
  async createConversation(
    userId: string,
    input: { memberIds: string[]; name?: string }
  ): Promise<{ id: string }> {
    const memberIds = [...new Set(input.memberIds)].filter(
      (id) => id !== userId
    )
    if (!memberIds.length) {
      throw new BadRequestException("Chọn ít nhất một người để trò chuyện")
    }
    const users = await this.directory.getMany(memberIds)
    if (users.length !== memberIds.length) {
      throw new NotFoundException("Không tìm thấy người dùng")
    }

    if (memberIds.length === 1) {
      const id = dmChannelId(userId, memberIds[0])
      await this.ensureChannel(id, { kind: "dm", createdBy: userId })
      await this.addMembers(id, [userId, memberIds[0]], [userId])
      this.events.channelChanged([userId, memberIds[0]], id)
      return { id }
    }

    if (!input.name) throw new BadRequestException("Nhóm cần có tên")
    if (memberIds.length + 1 > MAX_GROUP_MEMBERS) {
      throw new BadRequestException(
        `Nhóm tối đa ${MAX_GROUP_MEMBERS} thành viên`
      )
    }
    const id = `group-${randomUUID().replaceAll("-", "")}`
    await this.ensureChannel(id, {
      kind: "group",
      name: input.name,
      createdBy: userId,
    })
    await this.addMembers(id, [userId, ...memberIds])
    this.events.channelChanged([userId, ...memberIds], id)
    return { id }
  }

  /**
   * Remove one of the caller's own conversations from their list. It's always
   * the *caller* who's removed, so no host/creator check is needed:
   *
   * - **Group** (3+ members) → *leave*: the caller drops out, everyone else
   *   keeps the group and its history.
   * - **DM / 1:1 chat** (≤2 members) → *delete for me only*: hidden for the
   *   caller with their history cleared. The other member is untouched, and
   *   the thread reappears if a new message is sent to it.
   */
  async leaveConversation(userId: string, channelId: string): Promise<void> {
    const { memberIds } = await this.assertMember(userId, channelId)
    if (memberIds.length > 2) {
      await this.members.deleteOne({ channelId, userId })
    } else {
      const now = new Date()
      await this.members.updateOne(
        { channelId, userId },
        { $set: { hidden: true, clearedAt: now, lastReadAt: now } }
      )
    }
    this.events.channelChanged(memberIds, channelId)
  }

  /**
   * Open (get-or-create) the caller's persistent chat with a venue's real
   * owner — gated on a paid (or refunded) booking there. Resolves the venue
   * either directly (`venueId`) or via one of the caller's own bookings
   * (`bookingId`, which wins if both are given).
   */
  async openVenueChat(
    userId: string,
    input: { venueId?: string; bookingId?: string }
  ): Promise<{ id: string }> {
    let venueId = input.venueId

    if (input.bookingId) {
      const booking = await this.bookings
        .findOne({ bookingId: input.bookingId })
        .lean()
      if (!booking || booking.userId !== userId) {
        throw new NotFoundException("Không tìm thấy lượt đặt sân")
      }
      venueId = booking.venueId
    } else if (!venueId) {
      throw new BadRequestException("Thiếu venueId hoặc bookingId")
    }

    const venue = await this.venues.findOne({ venueId }).lean()
    if (!venue) throw new NotFoundException("Không tìm thấy sân")
    if (!venue.ownerId) {
      throw new BadRequestException("Sân này chưa hỗ trợ nhắn tin")
    }
    if (userId === venue.ownerId) {
      throw new BadRequestException("Bạn là chủ sân này")
    }

    const eligible = await this.bookings.exists({
      userId,
      venueId,
      paymentStatus: {
        $in: ["awaiting_verification", "paid", "refunded", "partial_refund"],
      },
    })
    if (!eligible) {
      throw new ForbiddenException(
        "Bạn cần hoàn tất một lượt đặt sân trước khi nhắn tin với sân"
      )
    }

    // The operator's account must still exist — a venue whose owner was
    // deleted from Clerk can't read replies, so a chat would silently go
    // nowhere. (A Clerk outage throws instead of reading as "deleted".)
    const owner = await this.directory.findExisting(venue.ownerId)
    if (!owner) {
      throw new BadRequestException("Sân này hiện không nhận tin nhắn")
    }

    const id = await this.ensureBookingChannel({
      playerId: userId,
      ownerId: venue.ownerId,
      venueId,
      brandId: venue.brandId,
      name: venue.info.name,
    })
    // Opening it from a "message the venue" button brings back a thread the
    // player had deleted for themselves.
    await this.members.updateOne(
      { channelId: id, userId },
      { $set: { hidden: false } }
    )
    return { id }
  }

  /**
   * The channel to use for a player's chat with a brand: the brand-keyed one if
   * it exists, else the oldest per-branch chat left from before chats were
   * brand-scoped (so its history isn't stranded), else a new brand-keyed id.
   * `existing` is true only when reusing a per-branch chat that needs tagging.
   */
  private async resolveBrandChannel(
    brandId: string,
    userId: string
  ): Promise<{ id: string; existing: boolean }> {
    const brandKeyed = brandChannelId(brandId, userId)
    const branches = await this.venues
      .find({ brandId })
      .select("venueId")
      .lean<{ venueId: string }[]>()
    const legacyIds = branches.map((b) => venueChannelId(b.venueId, userId))
    if (!legacyIds.length) return { id: brandKeyed, existing: false }

    const found = await this.channels
      .find({ channelId: { $in: [brandKeyed, ...legacyIds] } })
      .sort({ createdAt: 1 })
      .select("channelId")
      .lean<{ channelId: string }[]>()
    const ids = found.map((c) => c.channelId)
    if (ids.includes(brandKeyed)) return { id: brandKeyed, existing: false }
    return ids[0]
      ? { id: ids[0], existing: true }
      : { id: brandKeyed, existing: false }
  }
}
