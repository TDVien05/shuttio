import { Inject, Injectable } from "@nestjs/common"

import { CentrifugoService } from "../realtime/centrifugo.service.js"
import { userSessionsChannel } from "../realtime/channels.js"

/**
 * Per-user "your sessions changed" signal over Centrifugo
 * (`personal:sessions#<userId>`, subscribable only by that user). It carries
 * no data — the client re-fetches `GET /api/sessions`.
 */
@Injectable()
export class SessionEventsService {
  constructor(
    @Inject(CentrifugoService) private readonly centrifugo: CentrifugoService
  ) {}

  /** Notify a specific player that their sessions may have changed. */
  emit(userId: string): void {
    void this.centrifugo.publish(userSessionsChannel(userId), {})
  }
}
