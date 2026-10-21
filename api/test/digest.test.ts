import assert from "node:assert/strict"
import { test } from "node:test"

import { buildDigest } from "../src/features/notifications/digest.js"

const APP = "https://shuttio.test"

void test("15 chat messages from one sender become one counted line", () => {
  const events = Array.from({ length: 15 }, () => ({
    kind: "chat" as const,
    text: "Nguyễn A đã gửi tin nhắn mới",
    actorName: "Nguyễn A",
  }))
  const digest = buildDigest(events, APP)
  assert.equal(digest.subject, "Shuttio: 15 thông báo mới")
  assert.match(digest.text, /^- Nguyễn A đã gửi 15 tin nhắn cho bạn$/m)
  assert.equal(digest.text.match(/^- /gm)?.length, 1)
  assert.match(digest.text, /Xem chi tiết: https:\/\/shuttio\.test$/)
})

void test("different senders get separate lines, in first-seen order", () => {
  const digest = buildDigest(
    [
      { kind: "chat", text: "B", actorName: "Trần B" },
      { kind: "chat", text: "A", actorName: "Lê A" },
      { kind: "chat", text: "B", actorName: "Trần B" },
    ],
    APP
  )
  const lines = digest.text.split("\n").filter((l) => l.startsWith("- "))
  assert.deepEqual(lines, [
    "- Trần B đã gửi 2 tin nhắn cho bạn",
    "- Lê A đã gửi 1 tin nhắn cho bạn",
  ])
})

void test("a single system event keeps its own text", () => {
  const digest = buildDigest(
    [{ kind: "booking", text: "Chủ sân đã duyệt đặt sân của bạn." }],
    APP
  )
  assert.match(digest.text, /^- Chủ sân đã duyệt đặt sân của bạn\.$/m)
  assert.equal(digest.subject, "Shuttio: 1 thông báo mới")
})

void test("several system events of one kind are counted, not repeated", () => {
  const digest = buildDigest(
    [
      { kind: "booking", text: "Đơn 1" },
      { kind: "booking", text: "Đơn 2" },
      { kind: "booking", text: "Đơn 3" },
    ],
    APP
  )
  assert.match(digest.text, /^- 3 thông báo về đặt sân$/m)
})
