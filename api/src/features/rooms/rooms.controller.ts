import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
} from "@nestjs/common"

import { UserId } from "../../common/user-id.decorator.js"
import { UserThrottle } from "../../common/user-throttler.guard.js"
import {
  ChannelIdParamDto,
  CheckInBodyDto,
  RoomIdParamDto,
  RoomRequestDecisionBodyDto,
  RoomRequestParamDto,
} from "./rooms.dto.js"
import { RoomsService } from "./rooms.service.js"
import { SelfCourtService } from "./self-court.service.js"

// Cross-user room browsing/coordination (VienTD-Review Phase 9 G2). The
// global `/api` prefix + `ClerkAuthGuard` apply automatically, so every
// route requires a signed-in user — beyond that, `RoomsService` enforces who
// may act on which room (host-only decisions, self-only leave).
@Controller("rooms")
export class RoomsController {
  // Explicit tokens: tsx-based runners don't emit the constructor metadata
  // implicit injection relies on (same note as SessionsService).
  constructor(
    @Inject(RoomsService) private readonly rooms: RoomsService,
    @Inject(SelfCourtService) private readonly selfCourt: SelfCourtService
  ) {}

  /** Every listed, non-demo, still-open room across all users. */
  @Get()
  list(@UserId() userId: string) {
    return this.rooms.listRooms(userId)
  }

  /** Self-booked room: the host says the court is booked with the venue. */
  @Put(":id/court-confirmed")
  async confirmCourt(@UserId() userId: string, @Param() param: RoomIdParamDto) {
    await this.selfCourt.confirmCourt(userId, param.id)
    return { ok: true }
  }

  /** Self-booked room: check in on site (GPS, near the pinned court). */
  @UserThrottle({ limit: 20, ttl: 60_000 })
  @Post(":id/check-in")
  checkIn(
    @UserId() userId: string,
    @Param() param: RoomIdParamDto,
    @Body() body: CheckInBodyDto
  ) {
    return this.selfCourt.checkIn(userId, param.id, body)
  }

  /** Self-booked room: a player who is there confirms another seat holder came. */
  @Post(":id/attendance/:userId")
  async vouch(@UserId() userId: string, @Param() param: RoomRequestParamDto) {
    await this.selfCourt.vouch(userId, param.id, param.userId)
    return { ok: true }
  }

  /** The match a group chat is coordinating — any member of the chat may read it. */
  @Get("by-channel/:channelId")
  groupMatch(@UserId() userId: string, @Param() param: ChannelIdParamDto) {
    return this.rooms.groupMatch(userId, param.channelId)
  }

  /** Ask to join a room — takes a `requested` seat pending the host's decision. */
  @Post(":id/requests")
  async request(@UserId() userId: string, @Param() param: RoomIdParamDto) {
    await this.rooms.requestJoin(userId, param.id)
    return { ok: true }
  }

  /** Host approves/declines a pending join request. */
  @Put(":id/requests/:userId")
  async decide(
    @UserId() hostUserId: string,
    @Param() param: RoomRequestParamDto,
    @Body() body: RoomRequestDecisionBodyDto
  ) {
    await this.rooms.decideRequest(
      hostUserId,
      param.id,
      param.userId,
      body.decision
    )
    return { ok: true }
  }

  /** The host cancels their room — it vanishes for everyone; members are notified. */
  @Delete(":id")
  async disband(@UserId() userId: string, @Param() param: RoomIdParamDto) {
    await this.rooms.disbandRoom(userId, param.id)
    return { ok: true }
  }

  /** A confirmed member leaves the room on their own. */
  @Delete(":id/members/me")
  leave(@UserId() userId: string, @Param() param: RoomIdParamDto) {
    return this.rooms.leaveRoom(userId, param.id)
  }

  /** Host confirms a member has paid their court share. */
  @Put(":id/members/:userId/paid")
  async markPaid(
    @UserId() hostUserId: string,
    @Param() param: RoomRequestParamDto
  ) {
    await this.rooms.markMemberPaid(hostUserId, param.id, param.userId)
    return { ok: true }
  }

  /** Host sends a payment reminder notification to a member. */
  @Post(":id/members/:userId/remind")
  async remind(
    @UserId() hostUserId: string,
    @Param() param: RoomRequestParamDto
  ) {
    await this.rooms.remindMember(hostUserId, param.id, param.userId)
    return { ok: true }
  }
}
