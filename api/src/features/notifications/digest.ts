import type { NotificationKind } from "../../shared/index.js"

/** One pending event as the digest sees it (see `NotificationEmailEvent`). */
export interface DigestEvent {
  kind: NotificationKind
  text: string
  actorName?: string
}

export interface Digest {
  subject: string
  text: string
}

const KIND_LABEL: Record<NotificationKind, string> = {
  match: "ghép trận",
  chat: "tin nhắn",
  booking: "đặt sân",
  rating: "đánh giá",
  streak: "luyện tập",
}

/**
 * Summarize one user's pending events into a single plain-text email. Purely
 * algorithmic (no model): events group by (kind, actor). A chat group reads
 * "Nguyễn A đã gửi 15 tin nhắn cho bạn"; any other group with one event reuses
 * that event's own text, and with several reads "3 thông báo về đặt sân".
 * Groups keep the order in which they first appear, so pass events oldest-first.
 */
export function buildDigest(
  events: readonly DigestEvent[],
  appUrl: string
): Digest {
  const groups = new Map<
    string,
    { kind: NotificationKind; actorName?: string; count: number; text: string }
  >()
  for (const event of events) {
    const key = `${event.kind}\u0000${event.actorName ?? ""}`
    const group = groups.get(key)
    if (group) group.count += 1
    else
      groups.set(key, {
        kind: event.kind,
        actorName: event.actorName,
        count: 1,
        text: event.text,
      })
  }

  const lines = [...groups.values()].map((group) => {
    if (group.kind === "chat" && group.actorName) {
      return `${group.actorName} đã gửi ${group.count} tin nhắn cho bạn`
    }
    if (group.count === 1) return group.text
    return `${group.count} thông báo về ${KIND_LABEL[group.kind]}`
  })

  const total = events.length
  return {
    subject: `Shuttio: ${total} thông báo mới`,
    text: [
      "Bạn có các cập nhật mới trên Shuttio:",
      "",
      ...lines.map((line) => `- ${line}`),
      "",
      `Xem chi tiết: ${appUrl}`,
    ].join("\n"),
  }
}
