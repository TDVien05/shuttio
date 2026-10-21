import { describe, expect, it } from "vitest"

import type { NotificationRecord } from "@/lib/shared"
import {
  applyAllNotificationsRead,
  applyNotificationRead,
} from "@/features/dashboard/api/dashboard.queries"

function record(
  overrides: Partial<NotificationRecord> = {}
): NotificationRecord {
  return {
    id: "n1",
    kind: "booking",
    text: "Sân đã được xác nhận",
    read: false,
    createdAt: "2026-10-21T10:00:00+07:00",
    ...overrides,
  }
}

describe("applyNotificationRead", () => {
  it("flips only the target record and keeps other identities", () => {
    const first = record()
    const second = record({ id: "n2" })

    const result = applyNotificationRead([first, second], "n1")

    expect(result?.[0]).toEqual({ ...first, read: true })
    expect(result?.[1]).toBe(second)
    // The source snapshot is never mutated.
    expect(first.read).toBe(false)
  })

  it("preserves an empty cache", () => {
    expect(applyNotificationRead(undefined, "n1")).toBeUndefined()
  })
})

describe("applyAllNotificationsRead", () => {
  it("flips every record read", () => {
    const result = applyAllNotificationsRead([
      record(),
      record({ id: "n2", read: true }),
    ])

    expect(result?.map((item) => item.read)).toEqual([true, true])
  })

  it("preserves an empty cache", () => {
    expect(applyAllNotificationsRead(undefined)).toBeUndefined()
  })
})
