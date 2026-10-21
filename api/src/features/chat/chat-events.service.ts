import { Inject, Injectable } from "@nestjs/common"

import type { ChatEvent, ChatMessage } from "../../shared/index.js"
import { CentrifugoService } from "../realtime/centrifugo.service.js"
import { userChatChannel } from "../realtime/channels.js"

/**
 * Fans chat changes out to each affected user's own realtime channel
 * (`personal:chat#<userId>`). Per-user channels mean Centrifugo itself enforces
 * who can listen, and a member removed from a chat stops receiving instantly —
 * no per-conversation subscription tokens to revoke. Publishing is best-effort
 * (`CentrifugoService#publish` swallows failures): the data is already stored.
 */
@Injectable()
export class ChatEventsService {
  constructor(
    @Inject(CentrifugoService) private readonly centrifugo: CentrifugoService
  ) {}

  private publish(userIds: string[], event: ChatEvent): void {
    for (const userId of new Set(userIds)) {
      void this.centrifugo.publish(userChatChannel(userId), event)
    }
  }

  /** A new message, to every member of its channel. */
  message(memberIds: string[], message: ChatMessage): void {
    this.publish(memberIds, {
      type: "message",
      channelId: message.channelId,
      message,
    })
  }

  /** The channel list changed for these users — they refetch it. */
  channelChanged(userIds: string[], channelId: string): void {
    this.publish(userIds, { type: "channel", channelId })
  }
}
