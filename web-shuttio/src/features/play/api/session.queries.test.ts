import { describe, expect, it } from "vitest"

import type { PlaySession } from "@/lib/shared"
import {
  applyJoinRequest,
  applyRoomDecision,
} from "@/features/play/api/session.queries"

function session(overrides: Partial<PlaySession> = {}): PlaySession {
  return {
    id: "s1",
    title: "Tối nay",
    sport: "badminton",
    format: "Doubles",
    courtId: "c1",
    dayKey: "2026-10-21",
    dayLabel: "Hôm nay",
    slot: "18:00",
    durationMin: 60,
    courtLabel: "Sân 1",
    host: { name: "Quân", initials: "Q" },
    capacity: 4,
    roster: [
      { name: "Quân", initials: "Q", rsvp: "host", userId: "u-host" },
      {
        name: "Mai",
        initials: "M",
        rsvp: "requested",
        userId: "u-mai",
      },
      { name: "Lan", initials: "L", rsvp: "going", userId: "u-lan" },
    ],
    level: "any",
    status: "forming",
    listed: true,
    fillIntent: "find",
    venue: "Ace Pavilion",
    ward: "Bến Nghé",
    distanceKm: 2.4,
    pricePerHour: 180_000,
    ...overrides,
  }
}

describe("applyRoomDecision", () => {
  it("approves the target request without touching other seats or rooms", () => {
    const target = session()
    const other = session({ id: "s2", roster: [] })

    const result = applyRoomDecision([target, other], {
      roomId: "s1",
      targetUserId: "u-mai",
      decision: "approve",
    })

    expect(result?.[0]?.roster).toEqual([
      { name: "Quân", initials: "Q", rsvp: "host", userId: "u-host" },
      { name: "Mai", initials: "M", rsvp: "going", userId: "u-mai" },
      { name: "Lan", initials: "L", rsvp: "going", userId: "u-lan" },
    ])
    // Unrelated rooms keep their identity, so consumers can skip re-rendering.
    expect(result?.[1]).toBe(other)
    // The source snapshot is never mutated.
    expect(target.roster[1]?.rsvp).toBe("requested")
  })

  it("declines the target request by removing that seat", () => {
    const result = applyRoomDecision([session()], {
      roomId: "s1",
      targetUserId: "u-mai",
      decision: "decline",
    })

    expect(result?.[0]?.roster.map((player) => player.userId)).toEqual([
      "u-host",
      "u-lan",
    ])
  })

  it("leaves every room untouched when the decision targets another room", () => {
    const first = session()
    const second = session({ id: "s2" })

    const result = applyRoomDecision([first, second], {
      roomId: "missing",
      targetUserId: "u-mai",
      decision: "decline",
    })

    expect(result?.[0]).toBe(first)
    expect(result?.[1]).toBe(second)
  })

  it("preserves an empty cache", () => {
    expect(
      applyRoomDecision(undefined, {
        roomId: "s1",
        targetUserId: "u-mai",
        decision: "approve",
      })
    ).toBeUndefined()
  })
})

describe("applyJoinRequest", () => {
  const input = {
    roomId: "s1",
    userId: "u-me",
    userName: "Minh",
    initials: "Mi",
    at: 1_000,
  }

  it("adds my pending seat to the target room only", () => {
    const target = session()
    const other = session({ id: "s2", roster: [] })

    const result = applyJoinRequest([target, other], input)

    expect(result?.[0]?.roster.at(-1)).toEqual({
      name: "Minh",
      initials: "Mi",
      rsvp: "requested",
      rsvpAt: 1_000,
      userId: "u-me",
    })
    // Unrelated rooms keep their identity.
    expect(result?.[1]).toBe(other)
    // The source snapshot is never mutated.
    expect(target.roster).toHaveLength(3)
  })

  it("does not duplicate a seat I already hold", () => {
    const target = session({
      roster: [{ name: "Minh", initials: "Mi", rsvp: "going", userId: "u-me" }],
    })

    expect(applyJoinRequest([target], input)?.[0]).toBe(target)
  })

  it("preserves an empty cache", () => {
    expect(applyJoinRequest(undefined, input)).toBeUndefined()
  })
})
