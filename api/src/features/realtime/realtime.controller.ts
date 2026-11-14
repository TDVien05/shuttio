import { Body, Controller, HttpCode, Inject, Post } from "@nestjs/common"

import { UserThrottle } from "../../common/user-throttler.guard.js"
import { UserId } from "../../common/user-id.decorator.js"
import { CentrifugoService } from "./centrifugo.service.js"
import { PresenceService } from "./presence.service.js"
import { PresenceBodyDto } from "./realtime.dto.js"

@Controller("realtime")
export class RealtimeController {
  constructor(
    @Inject(CentrifugoService) private readonly centrifugo: CentrifugoService,
    @Inject(PresenceService) private readonly presence: PresenceService
  ) {}

  /**
   * A Centrifugo connection token for the signed-in user. The identity comes
   * only from the verified Clerk session (never the request body); clients
   * call this on connect and again before each token expires — which is also
   * the heartbeat behind "last active" (`PresenceService`).
   */
  @UserThrottle({ limit: 20, ttl: 60_000 })
  @Post("token")
  token(@UserId() userId: string) {
    void this.presence.touch([userId])
    return this.centrifugo.connectionToken(userId)
  }

  /**
   * Who of `userIds` is online right now, and when the others were last
   * active. POST because the id list goes in the body; it reads only.
   */
  @UserThrottle({ limit: 30, ttl: 60_000 })
  @Post("presence")
  @HttpCode(200)
  presenceOf(@UserId() userId: string, @Body() body: PresenceBodyDto) {
    return this.presence.statuses(userId, body.userIds)
  }
}
