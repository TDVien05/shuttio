import type { ChatChannel, ChatUser } from "@/lib/shared"
import { m } from "@/paraglide/messages"

/** The other person in a 1:1 conversation (a DM or a venue thread). */
export function otherMember(
  channel: ChatChannel,
  userId: string
): ChatUser | undefined {
  return channel.members.find((member) => member.id !== userId)
}

/** What the list and the header call a conversation. */
export function channelTitle(channel: ChatChannel, userId: string): string {
  if (channel.kind === "dm") {
    return otherMember(channel, userId)?.name ?? m.chat_untitled()
  }
  // A venue thread is titled by the venue for the player, and by the player
  // for the operator, who is the one who didn't start it.
  if (channel.kind === "venue" && channel.createdBy === userId) {
    return channel.name ?? m.chat_untitled()
  }
  if (channel.kind === "venue") {
    return (
      otherMember(channel, userId)?.name ?? channel.name ?? m.chat_untitled()
    )
  }
  return channel.name ?? m.chat_untitled()
}

/** The avatar to show for a conversation, when it's a 1:1 with a person. */
export function channelAvatarUser(
  channel: ChatChannel,
  userId: string
): ChatUser | undefined {
  return channel.kind === "dm" ||
    (channel.kind === "venue" && channel.createdBy !== userId)
    ? otherMember(channel, userId)
    : undefined
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters =
    words.length > 1
      ? [words[0], words[words.length - 1]].map((w) => w[0])
      : [words[0]?.slice(0, 2) ?? "?"]
  return letters.join("").toUpperCase()
}

/** The list's one-line preview of the latest message. */
export function previewText(channel: ChatChannel, userId: string): string {
  const last = channel.lastMessage
  if (!last) return ""
  const body = last.text || (last.hasImage ? m.chat_image_preview() : "")
  if (last.senderId === userId) return `${m.chat_you()}: ${body}`
  return body
}

/** Whether `name` is in a language-independent order-insensitive filter match. */
export const matchesQuery = (title: string, query: string) =>
  title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
