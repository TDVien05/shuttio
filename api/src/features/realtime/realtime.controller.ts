import { Controller, Inject, Post } from "@nestjs/common"

import { UserThrottle } from "../../common/user-throttler.guard.js"
import { UserId } from "../../common/user-id.decorator.js"
import { CentrifugoService } from "./centrifugo.service.js"

@Controller("realtime")
export class RealtimeController {
  constructor(
    @Inject(CentrifugoService) private readonly centrifugo: CentrifugoService
  ) {}

  /**
   * A Centrifugo connection token for the signed-in user. The identity comes
   * only from the verified Clerk session (never the request body); clients
   * call this on connect and again before each token expires.
   */
  @UserThrottle({ limit: 20, ttl: 60_000 })
  @Post("token")
  token(@UserId() userId: string) {
    return this.centrifugo.connectionToken(userId)
  }
}
