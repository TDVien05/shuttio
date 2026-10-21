import { describe, expect, it } from "vitest"

import {
  deriveActiveSession,
  deriveBookings,
  deriveExpiries,
  deriveHostedIds,
  deriveJoinedIds,
  deriveJoinedSessions,
  deriveOtherRooms,
  deriveRemoteJoinedIds,
  deriveRequestedIds,
  deriveRooms,
  hostedRoomCount,
  isRoomSuitable,
  wellFormedRooms,
} from "@/features/play/lib/matchmaking-derive"
import { INVITE_EXPIRY_MS, REQUEST_EXPIRY_MS } from "@/lib/shared"
import type { Court, PlaySession } from "@/lib/shared"

const court: Court = {
  id: "c1",
  name: "Ace Pavilion",
  ward: "Bến Nghé",
  province: "TP. Hồ Chí Minh",
  sports: ["badminton"],
  surface: "Wood",
  pricePerHour: 180_000,
  distanceKm: 2.4,
  rating: 4.8,
  openSlots: 4,
  nextSlot: "18:00",
  freePct: 50,
  lat: null,
  lng: null,
}

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
    roster: [{ name: "Quân", initials: "Q", rsvp: "host" }],
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

describe("room derivations", () => {
  it("drops malformed cross-user rooms instead of crashing projections", () => {
    const rooms = wellFormedRooms([
      session(),
      { id: "bad" },
      null,
      { id: "no-roster" },
    ])
    expect(rooms.map((r) => r.id)).toEqual(["s1"])
  })

  it("excludes my own sessions from the cross-user room pool", () => {
    const mine = session({ id: "mine" })
    const theirs = session({ id: "theirs" })
    expect(
      deriveOtherRooms([mine], [mine, theirs]).map((room) => room.id)
    ).toEqual(["theirs"])
  })

  it("derives remote seats, hosted rooms, requested rooms and the joined union", () => {
    const mine = session({
      id: "hosted",
      roster: [{ name: "Quân", initials: "Q", rsvp: "host", userId: "u1" }],
    })
    const remoteGoing = session({
      id: "remote-going",
      roster: [{ name: "Quân", initials: "Q", rsvp: "going", userId: "u1" }],
    })
    const remoteRequested = session({
      id: "remote-requested",
      roster: [
        { name: "Quân", initials: "Q", rsvp: "requested", userId: "u1" },
      ],
    })

    const hosted = deriveHostedIds([mine], "Q")
    const remote = deriveRemoteJoinedIds([remoteGoing, remoteRequested], "u1")
    const requested = deriveRequestedIds(
      [remoteGoing, remoteRequested],
      "u1"
    )
    const joined = deriveJoinedIds(new Set(["local"]), hosted, remote)

    expect([...hosted]).toEqual(["hosted"])
    expect([...remote]).toEqual(["remote-going"])
    expect([...requested]).toEqual(["remote-requested"])
    expect([...joined].sort()).toEqual(["hosted", "local", "remote-going"])
    expect(hostedRoomCount([mine], "Q")).toBe(1)
  })

  it("projects joined sessions and picks the active one", () => {
    const first = session({ id: "a" })
    const second = session({ id: "b" })
    const joined = deriveJoinedSessions(
      [first, second],
      [],
      new Set(["a", "b"]),
      new Set(),
      new Set()
    )
    expect(joined.map((s) => s.id)).toEqual(["a", "b"])
    expect(deriveActiveSession(joined, "b")?.id).toBe("b")
    expect(deriveActiveSession(joined, null)?.id).toBe("a")
    expect(deriveActiveSession([], "missing")).toBeNull()
  })

  it("projects the browse pool with court distance and the booking list", () => {
    const booked = session({
      id: "booked",
      status: "booked",
      listed: false,
      reservationId: "b1",
    })
    const rooms = deriveRooms([session()], [], [court])
    const bookings = deriveBookings([booked], [court])

    expect(rooms[0]?.distanceKm).toBe(2.4)
    expect(bookings[0]?.id).toBe("booked")
    expect(bookings[0]?.court).toBe("Sân 1")
  })

  it("only marks a joinable room suitable when it has space and isn't mine", () => {
    const room = deriveRooms([session()], [], [court])[0]!
    expect(isRoomSuitable(room, new Set())).toBe(true)
    expect(isRoomSuitable(room, new Set(["s1"]))).toBe(false)
    expect(
      isRoomSuitable({ ...room, joined: room.capacity }, new Set())
    ).toBe(false)
    expect(isRoomSuitable({ ...room, demo: true }, new Set())).toBe(false)
  })
})

describe("expiry derivations", () => {
  const now = 1_000_000_000

  it("flags a hold exactly at its deadline and RSVPs past theirs", () => {
    const held = session({ holdExpiresAt: now })
    const liveHold = session({ id: "later", holdExpiresAt: now + 1 })
    const requested = session({
      id: "requested",
      roster: [
        {
          name: "Mai",
          initials: "M",
          rsvp: "requested",
          rsvpAt: now - REQUEST_EXPIRY_MS - 1,
        },
        {
          name: "Boundary",
          initials: "B",
          rsvp: "requested",
          rsvpAt: now - REQUEST_EXPIRY_MS,
        },
        { name: "Host", initials: "H", rsvp: "host" },
      ],
    })
    const invited = session({
      id: "invited",
      roster: [
        {
          name: "Invitee",
          initials: "I",
          rsvp: "pending",
          rsvpAt: now - INVITE_EXPIRY_MS - 1,
        },
        {
          name: "No clock",
          initials: "N",
          rsvp: "pending",
        },
      ],
    })

    const result = deriveExpiries([held, liveHold, requested, invited], now)

    expect(result.heldExpired.map((s) => s.id)).toEqual(["s1"])
    expect(
      result.rsvpExpired.map(({ session: s, player }) => `${s.id}:${player.initials}`)
    ).toEqual(["requested:M", "invited:I"])
  })

  it("never expires a host or going seat", () => {
    const room = session({
      roster: [
        { name: "Host", initials: "H", rsvp: "host", rsvpAt: 0 },
        { name: "Player", initials: "P", rsvp: "going", rsvpAt: 0 },
      ],
    })
    expect(deriveExpiries([room], now).rsvpExpired).toEqual([])
  })
})
