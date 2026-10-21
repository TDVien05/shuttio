import { describe, expect, it } from "vitest"
import type { ChatChannel, ChatMessage } from "@/lib/shared"
import { getMessageStatus } from "./chat-utils"

describe("getMessageStatus", () => {
  const currentUserId = "user-me"
  const otherUserId = "user-other"

  const baseChannel: ChatChannel = {
    id: "ch-1",
    kind: "dm",
    name: null,
    createdBy: currentUserId,
    members: [
      { id: currentUserId, name: "Me" },
      { id: otherUserId, name: "Other" },
    ],
    frozen: false,
    unread: 0,
    updatedAt: "2026-10-21T10:00:00.000Z",
    memberReadAt: {},
    memberDeliveredAt: {},
  }

  const baseMessage: ChatMessage = {
    id: "msg-1",
    channelId: "ch-1",
    senderId: currentUserId,
    text: "Hello",
    createdAt: "2026-10-21T10:00:00.000Z",
  }

  it("returns 'sending' when message status is explicitly sending", () => {
    const msg: ChatMessage = { ...baseMessage, status: "sending" }
    expect(getMessageStatus(msg, baseChannel, currentUserId)).toBe("sending")
  })

  it("returns 'seen' for incoming messages from others", () => {
    const msg: ChatMessage = { ...baseMessage, senderId: otherUserId }
    expect(getMessageStatus(msg, baseChannel, currentUserId)).toBe("seen")
  })

  it("returns 'sent' when recipient has not yet received or read", () => {
    const channel: ChatChannel = {
      ...baseChannel,
      memberDeliveredAt: { [otherUserId]: "2026-10-21T09:59:00.000Z" },
      memberReadAt: { [otherUserId]: "2026-10-21T09:58:00.000Z" },
    }
    expect(getMessageStatus(baseMessage, channel, currentUserId)).toBe("sent")
  })

  it("returns 'delivered' when recipient received the message but has not read it", () => {
    const channel: ChatChannel = {
      ...baseChannel,
      memberDeliveredAt: { [otherUserId]: "2026-10-21T10:01:00.000Z" },
      memberReadAt: { [otherUserId]: "2026-10-21T09:59:00.000Z" },
    }
    expect(getMessageStatus(baseMessage, channel, currentUserId)).toBe(
      "delivered"
    )
  })

  it("returns 'seen' when recipient has read up to or past the message timestamp", () => {
    const channel: ChatChannel = {
      ...baseChannel,
      memberDeliveredAt: { [otherUserId]: "2026-10-21T10:01:00.000Z" },
      memberReadAt: { [otherUserId]: "2026-10-21T10:02:00.000Z" },
    }
    expect(getMessageStatus(baseMessage, channel, currentUserId)).toBe("seen")
  })
})
