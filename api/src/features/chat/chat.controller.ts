import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common"

import { UserId } from "../../common/user-id.decorator.js"
import { UserThrottle } from "../../common/user-throttler.guard.js"
import { ClerkDirectoryService } from "../directory/clerk-directory.service.js"
import { ChatMessagesService } from "./chat-messages.service.js"
import {
  AddGroupMembersBodyDto,
  ChannelParamDto,
  CreateConversationBodyDto,
  CreateRoomBodyDto,
  DeleteGroupBodyDto,
  LeaveConversationBodyDto,
  ListChannelsQueryDto,
  ListMessagesQueryDto,
  RenameGroupBodyDto,
  RoomFreezeBodyDto,
  RoomMemberBodyDto,
  SendMessageBodyDto,
  UserSearchQueryDto,
  VenueChatBodyDto,
} from "./chat.dto.js"
import { ChatService } from "./chat.service.js"

// Chat endpoints. The global `/api` prefix + `ClerkAuthGuard` apply
// automatically, so every route requires a signed-in user.
@Controller("chat")
export class ChatController {
  constructor(
    @Inject(ChatService) private readonly chat: ChatService,
    @Inject(ChatMessagesService)
    private readonly messages: ChatMessagesService,
    @Inject(ClerkDirectoryService)
    private readonly directory: ClerkDirectoryService
  ) {}

  // ── Conversations & messages ─────────────────────────────────────────────

  /** The caller's conversations; `venueId` narrows to that venue's inbox. */
  @Get("channels")
  channels(@UserId() userId: string, @Query() query: ListChannelsQueryDto) {
    return this.chat.listChannels(userId, query.venueId)
  }

  /** One page of a conversation's history (oldest → newest). */
  @Get("channels/:channelId/messages")
  history(
    @UserId() userId: string,
    @Param() param: ChannelParamDto,
    @Query() query: ListMessagesQueryDto
  ) {
    return this.messages.list(userId, param.channelId, query)
  }

  /** Send a message and/or an already-uploaded picture. */
  @UserThrottle({ limit: 60, ttl: 60_000 })
  @Post("channels/:channelId/messages")
  send(
    @UserId() userId: string,
    @Param() param: ChannelParamDto,
    @Body() body: SendMessageBodyDto
  ) {
    return this.messages.send(userId, param.channelId, body)
  }

  /** Mark the conversation read for the caller. */
  @Post("channels/:channelId/read")
  async read(@UserId() userId: string, @Param() param: ChannelParamDto) {
    await this.messages.markRead(userId, param.channelId)
    return { ok: true }
  }

  /** Signed params for a direct browser → Cloudinary (private) picture upload. */
  @UserThrottle({ limit: 30, ttl: 60_000 })
  @Post("channels/:channelId/image-signature")
  imageSignature(@UserId() userId: string, @Param() param: ChannelParamDto) {
    return this.messages.signImageUpload(userId, param.channelId)
  }

  // ── Room chats ───────────────────────────────────────────────────────────

  /** Create a room's real chat with only the host as a member. */
  @Post("rooms")
  createRoom(@UserId() userId: string, @Body() body: CreateRoomBodyDto) {
    return this.chat.createRoomChannel(userId, body)
  }

  /** Host adds a real member to their room's chat (e.g. on approve). */
  @Post("rooms/members")
  async addMember(@UserId() userId: string, @Body() body: RoomMemberBodyDto) {
    await this.chat.addRoomMember(userId, body.channelId, body.memberId)
    return { ok: true }
  }

  /** Remove a member — host kick/decline, or a member leaving themselves. */
  @Delete("rooms/members")
  async removeMember(
    @UserId() userId: string,
    @Body() body: RoomMemberBodyDto
  ) {
    await this.chat.removeRoomMember(userId, body.channelId, body.memberId)
    return { ok: true }
  }

  /** Host freezes their room's chat on cancel — keeps history, blocks sends. */
  @Post("rooms/freeze")
  async freeze(@UserId() userId: string, @Body() body: RoomFreezeBodyDto) {
    await this.chat.freezeRoomChannel(userId, body.channelId)
    return { ok: true }
  }

  // ── Groups ───────────────────────────────────────────────────────────────

  /** Rename a group chat — any member may. */
  @Patch("groups/name")
  async renameGroup(
    @UserId() userId: string,
    @Body() body: RenameGroupBodyDto
  ) {
    await this.chat.renameGroup(userId, body.channelId, body.name)
    return { ok: true }
  }

  /** Group creator adds real users to their community group. */
  @Post("groups/members")
  async addGroupMembers(
    @UserId() userId: string,
    @Body() body: AddGroupMembersBodyDto
  ) {
    await this.chat.addGroupMembers(userId, body.channelId, body.memberIds)
    return { ok: true }
  }

  /** Delete a group chat for every member — its creator, or the last member left. */
  @Delete("groups")
  async deleteGroup(
    @UserId() userId: string,
    @Body() body: DeleteGroupBodyDto
  ) {
    await this.chat.deleteGroup(userId, body.channelId)
    return { ok: true }
  }

  // ── Community chat ───────────────────────────────────────────────────────

  /** Find real users by name (partial) or email (exact) to start a chat with. */
  @UserThrottle({ limit: 30, ttl: 60_000 })
  @Get("users/search")
  searchUsers(@UserId() userId: string, @Query() query: UserSearchQueryDto) {
    return this.directory.search(userId, query.q)
  }

  /** Start a DM (1 member) or a named group chat (2+ members). */
  @Post("conversations")
  createConversation(
    @UserId() userId: string,
    @Body() body: CreateConversationBodyDto
  ) {
    return this.chat.createConversation(userId, body)
  }

  /** Leave a group / delete a DM for the caller — removes it from their list. */
  @Delete("conversations")
  async leaveConversation(
    @UserId() userId: string,
    @Body() body: LeaveConversationBodyDto
  ) {
    await this.chat.leaveConversation(userId, body.channelId)
    return { ok: true }
  }

  /** Open (get-or-create) the caller's chat with a venue — needs a paid booking there. */
  @Post("venue-chats")
  openVenueChat(@UserId() userId: string, @Body() body: VenueChatBodyDto) {
    return this.chat.openVenueChat(userId, body)
  }
}
