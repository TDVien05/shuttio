import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { ForbiddenException } from "@nestjs/common"
import { Test } from "@nestjs/testing"

import { RoomEventsService } from "../src/features/rooms/room-events.service.js"
import { getModelToken } from "@nestjs/mongoose"

import {
  isSessionBooked,
  isSessionEnded,
  sessionParticipantIds,
  toGroupMatch,
} from "../src/features/rooms/group-match.js"
import { RoomsService } from "../src/features/rooms/rooms.service.js"
import { RoomComplaint } from "../src/features/rooms/room-complaint.schema.js"
import { BookingChatService } from "../src/features/bookings/booking-chat.service.js"
import { BookingsService } from "../src/features/bookings/bookings.service.js"
import { ReliabilityService } from "../src/features/reliability/reliability.service.js"
import { PlaySession } from "../src/features/sessions/session.schema.js"
import { NotificationsService } from "../src/features/notifications/notifications.service.js"
import { ProfileService } from "../src/features/players/profile.service.js"
import { ClerkDirectoryService } from "../src/features/directory/clerk-directory.service.js"
import { isGroupChannel } from "../src/features/chat/chat.ids.js"
import { ChatService } from "../src/features/chat/chat.service.js"
import { Booking } from "../src/features/bookings/booking.schema.js"
import type { PlaySession as PlaySessionData } from "../src/shared/index.js"

/**
 * Group-chat management: the pure "match a group coordinates" projections
 * (group-match.ts), `RoomsService#groupMatch` (what any member sees), and
 * Fakes follow rooms-service.test.ts — no real Mongo or Clerk. Rename/add-member
 * rules are covered in chat-service.test.ts.
 */

function makeSession(
  overrides: Partial<PlaySessionData> = {}
): PlaySessionData {
  return {
    id: "s-1",
    title: "Cầu lông tối thứ 6",
    sport: "badminton",
    format: "Doubles",
    courtId: "c1",
    dayKey: "2026-10-02",
    dayLabel: "Thứ 6",
    slot: "18:00",
    durationMin: 60,
    courtLabel: "Court 2",
    host: { name: "Host", initials: "HO" },
    capacity: 4,
    roster: [
      { name: "Host", initials: "HO", rsvp: "host" },
      { name: "An", initials: "AN", rsvp: "going", userId: "user-an" },
      { name: "Bình", initials: "BI", rsvp: "requested", userId: "user-bi" },
      { name: "Mock", initials: "MK", rsvp: "going" },
    ],
    level: "any",
    status: "booked",
    reservationId: "bk-1",
    listed: false,
    fillIntent: "court",
    venue: "Sân ABC",
    ward: "Q1",
    distanceKm: 1,
    pricePerHour: 100000,
    ...overrides,
  }
}

// ── group-match.ts ──────────────────────────────────────────────────────────

void test("isSessionBooked: held/paid sessions count, proposed or cancelled ones don't", () => {
  assert.equal(isSessionBooked(makeSession()), true)
  assert.equal(
    isSessionBooked(
      makeSession({ status: "forming", reservationId: undefined })
    ),
    false
  )
  assert.equal(isSessionBooked(makeSession({ status: "cancelled" })), false)
  assert.equal(isSessionBooked(makeSession({ status: "completed" })), true)
})

void test("isSessionEnded uses endAt, else dayKey+slot+duration, and only once booked", () => {
  const end = Date.parse("2026-10-02T19:00:00+07:00")
  assert.equal(isSessionEnded(makeSession(), end - 1), false)
  assert.equal(isSessionEnded(makeSession(), end), true)
  assert.equal(
    isSessionEnded(
      makeSession({ endAt: "2026-10-03T10:00:00+07:00" }),
      end + 1
    ),
    false
  )
  assert.equal(
    isSessionEnded(
      makeSession({ status: "forming", reservationId: undefined }),
      end + 1
    ),
    false
  )
  assert.equal(isSessionEnded(makeSession({ status: "completed" }), 0), true)
})

void test("sessionParticipantIds: host + confirmed real members only", () => {
  assert.deepEqual(sessionParticipantIds("host-1", makeSession()), [
    "host-1",
    "user-an",
  ])
})

void test("toGroupMatch projects the fields members need", () => {
  const m = toGroupMatch(
    "host-1",
    makeSession(),
    Date.parse("2026-10-05T00:00:00+07:00")
  )
  assert.equal(m.sessionId, "s-1")
  assert.equal(m.hostUserId, "host-1")
  assert.equal(m.booked, true)
  assert.equal(m.ended, true)
  assert.deepEqual(m.participantIds, ["host-1", "user-an"])
})

void test("isGroupChannel: groups and rooms yes, DMs and venue chats no", () => {
  const few = { memberIds: ["a", "b"], isVenueChat: false }
  assert.equal(isGroupChannel("group-x", few), true)
  assert.equal(isGroupChannel("room-x", few), true)
  assert.equal(isGroupChannel("dm-x", few), false)
  assert.equal(
    isGroupChannel("venue-x", { memberIds: ["a", "b"], isVenueChat: true }),
    false
  )
  assert.equal(
    isGroupChannel("demo-ch1-u", {
      memberIds: ["a", "b", "c"],
      isVenueChat: false,
    }),
    true
  )
})

// ── RoomsService#groupMatch ─────────────────────────────────────────────────

function findOneChain(doc: unknown, record?: (filter: unknown) => void) {
  return (filter: unknown) => {
    record?.(filter)
    return { sort: () => ({ lean: () => Promise.resolve(doc) }) }
  }
}

async function makeRooms(
  findOne: (filter: unknown) => unknown,
  assertMember: (userId: string, channelId: string) => Promise<unknown> = () =>
    Promise.resolve({ createdBy: "host-1", memberIds: [], isVenueChat: false })
) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      RoomsService,
      { provide: getModelToken(PlaySession.name), useValue: { findOne } },
      { provide: NotificationsService, useValue: {} },
      { provide: ProfileService, useValue: {} },
      { provide: ChatService, useValue: { assertMember } },
      { provide: ClerkDirectoryService, useValue: {} },
      // Court-share collaborators — groupMatch never touches them.
      { provide: getModelToken(Booking.name), useValue: {} },
      {
        provide: BookingsService,
        useValue: {},
      },
      { provide: getModelToken(RoomComplaint.name), useValue: {} },
      {
        provide: BookingChatService,
        useValue: { post: () => Promise.resolve() },
      },
      { provide: RoomEventsService, useValue: { emit: () => {} } },
      { provide: ReliabilityService, useValue: {} },
    ],
  }).compile()
  return moduleRef.get(RoomsService)
}

void test("groupMatch: a group with no linked session can be booked by its owner only", async () => {
  let filter: unknown
  const service = await makeRooms(findOneChain(null, (f) => (filter = f)))
  assert.deepEqual(await service.groupMatch("host-1", "group-abc"), {
    match: null,
    canBook: true,
  })
  assert.deepEqual(filter, {
    "data.chatChannelId": "group-abc",
    "data.status": { $ne: "cancelled" },
  })
  // Any other member waits for the owner.
  assert.deepEqual(await service.groupMatch("user-an", "group-abc"), {
    match: null,
    canBook: false,
  })
})

void test("groupMatch: a disbanded room's chat falls back to a match linked by chatChannelId, owner books", async () => {
  const filters: unknown[] = []
  const service = await makeRooms(findOneChain(null, (f) => filters.push(f)))
  const res = await service.groupMatch("host-1", "room-gone")
  assert.deepEqual(res, { match: null, canBook: true })
  assert.deepEqual(filters, [
    { sessionId: "gone" },
    { "data.chatChannelId": "room-gone", "data.status": { $ne: "cancelled" } },
  ])
  assert.equal(
    (await service.groupMatch("user-an", "room-gone")).canBook,
    false
  )
})

void test("groupMatch: chats nobody owns as a group (e.g. the seeded demo crew) can't be booked", async () => {
  const service = await makeRooms(findOneChain(null))
  assert.equal(
    (await service.groupMatch("host-1", "demo-ch1-host-1")).canBook,
    false
  )
})

void test("groupMatch: a room chat resolves its room by id", async () => {
  let filter: unknown
  const doc = { userId: "host-1", data: makeSession({ id: "r9" }) }
  const service = await makeRooms(findOneChain(doc, (f) => (filter = f)))
  const res = await service.groupMatch("user-an", "room-r9")
  assert.deepEqual(filter, { sessionId: "r9" })
  assert.equal(res.match?.sessionId, "r9")
  assert.equal(res.canBook, false)
})

void test("groupMatch: only the host may book a not-yet-booked match", async () => {
  const doc = {
    userId: "host-1",
    data: makeSession({ status: "forming", reservationId: undefined }),
  }
  const service = await makeRooms(findOneChain(doc))
  assert.equal((await service.groupMatch("host-1", "group-g")).canBook, true)
  assert.equal((await service.groupMatch("user-an", "group-g")).canBook, false)
})

void test("groupMatch rejects non-members", async () => {
  const service = await makeRooms(findOneChain(null), () =>
    Promise.reject(new ForbiddenException("nope"))
  )
  await assert.rejects(
    service.groupMatch("stranger", "group-g"),
    ForbiddenException
  )
})
