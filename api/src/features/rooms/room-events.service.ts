import { Inject, Injectable } from "@nestjs/common"

import { CentrifugoService } from "../realtime/centrifugo.service.js"
import { ROOMS_CHANGES_CHANNEL } from "../realtime/channels.js"

/**
 * Announces "a room changed" to every connected client over Centrifugo
 * (`rooms:changes`). A signal carries only the room id — clients refetch
 * `GET /api/rooms` for the data, so the channel never leaks anything the
 * rooms list doesn't already show.
 */
@Injectable()
export class RoomEventsService {
  constructor(
    @Inject(CentrifugoService) private readonly centrifugo: CentrifugoService
  ) {}

  /** Announce that a room was created, changed, or removed. */
  emit(roomId: string): void {
    void this.centrifugo.publish(ROOMS_CHANGES_CHANNEL, { roomId })
  }
}
