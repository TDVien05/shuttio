import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common"
import { getModelToken } from "@nestjs/mongoose"
import { Test } from "@nestjs/testing"

import { NotificationsService } from "../src/features/notifications/notifications.service.js"
import { matchCountsForElo } from "../src/features/ratings/peer-elo.service.js"
import { restrictedUntil } from "../src/features/reliability/reliability.service.js"
import { ReliabilityService } from "../src/features/reliability/reliability.service.js"
import {
  isSessionEnded,
  sessionParticipantIds,
  toGroupMatch,
} from "../src/features/rooms/group-match.js"
import { RoomEventsService } from "../src/features/rooms/room-events.service.js"
import { SelfCourtService } from "../src/features/rooms/self-court.service.js"
import { PlaySession } from "../src/features/sessions/session.schema.js"
import {
  assertValidSelfCourt,
  keepServerOwnedFields,
} from "../src/features/sessions/sessions.service.js"
import {
  checkInWindow,
  metersBetween,
  reliabilityScore,
  type PlaySession as PlaySessionData,
} from "../src/shared/index.js"

const COURT = { lat: 10.7769, lng: 106.7009 }
/** 2026-11-20 18:00 +07:00 */
const START = Date.parse("2026-11-20T18:00:00+07:00")
const MIN = 60_000

function selfRoom(overrides: Partial<PlaySessionData> = {}): PlaySessionData {
  return {
    id: "room-self",
    title: "Kèo tối thứ sáu",
    sport: "badminton",
    format: "Doubles",
    courtId: null,
    dayKey: "2026-11-20",
    dayLabel: "Thứ sáu",
    slot: "18:00",
    durationMin: 120,
    courtLabel: null,
    host: { name: "Host", initials: "HO" },
    capacity: 4,
    roster: [
      { name: "Host", initials: "HO", rsvp: "host" },
      { name: "An", initials: "AN", rsvp: "going", userId: "u-an" },
      { name: "Bình", initials: "BI", rsvp: "going", userId: "u-binh" },
      { name: "Chi", initials: "CH", rsvp: "requested", userId: "u-chi" },
    ],
    level: "any",
    status: "forming",
    listed: true,
    fillIntent: "find",
    venue: "Sân Kỳ Hoà",
    ward: "Q10",
    distanceKm: null,
    pricePerHour: 0,
    courtMode: "self",
    selfCourt: {
      name: "Sân Kỳ Hoà",
      address: "16 Lê Hồng Phong, Q10",
      ...COURT,
      confirmed: true,
      costPerPerson: 60000,
    },
    ranked: true,
    ...overrides,
  }
}

// ── Pure rules ───────────────────────────────────────────────────────────────

void test("metersBetween measures short distances precisely", () => {
  const d = metersBetween(COURT, { lat: COURT.lat + 0.001, lng: COURT.lng })
  assert.ok(d > 105 && d < 117, `got ${d}`)
})

void test("check-in opens 30 min before the start and closes at the end", () => {
  const w = checkInWindow(selfRoom())
  assert.deepEqual(w, {
    opensAt: START - 30 * MIN,
    closesAt: START + 120 * MIN,
  })
})

void test("a self-booked match ends with its slot, no booking needed", () => {
  const room = selfRoom({
    selfCourt: { ...selfRoom().selfCourt!, confirmed: false },
  })
  assert.equal(isSessionEnded(room, START + 60 * MIN), false)
  assert.equal(isSessionEnded(room, START + 121 * MIN), true)
  assert.equal(
    isSessionEnded({ ...room, status: "cancelled" }, START + 200 * MIN),
    false
  )
})

void test("only confirmed attendees take part in a self-booked match", () => {
  const room = selfRoom({
    attendance: {
      host: { at: "x", via: "gps" },
      "u-an": { at: "x", via: "vouch", by: "host" },
      "u-chi": { at: "x", via: "gps" }, // only requested — never counts
    },
  })
  assert.deepEqual(sessionParticipantIds("host", room).sort(), ["host", "u-an"])
  // An in-app room keeps the whole confirmed roster.
  assert.deepEqual(
    sessionParticipantIds("host", { ...room, courtMode: undefined }).sort(),
    ["host", "u-an", "u-binh"]
  )
  const match = toGroupMatch("host", room, START + 200 * MIN)
  assert.equal(match.courtMode, "self")
  assert.equal(match.ended, true)
  assert.deepEqual(match.memberIds?.sort(), ["host", "u-an", "u-binh"])
})

void test("Elo moves only for ranked matches with two GPS check-ins", () => {
  const gps = { at: "x", via: "gps" as const }
  assert.equal(
    matchCountsForElo("host", selfRoom({ attendance: { host: gps } })),
    false
  )
  assert.equal(
    matchCountsForElo(
      "host",
      selfRoom({
        attendance: {
          host: gps,
          "u-an": { at: "x", via: "vouch", by: "host" },
        },
      })
    ),
    false
  )
  assert.equal(
    matchCountsForElo(
      "host",
      selfRoom({ attendance: { host: gps, "u-an": gps } })
    ),
    true
  )
  assert.equal(
    matchCountsForElo(
      "host",
      selfRoom({ ranked: false, attendance: { host: gps, "u-an": gps } })
    ),
    false
  )
  assert.equal(matchCountsForElo("host", selfRoom({ courtMode: "app" })), true)
})

void test("reliability score weighs late cancels at half a no-show", () => {
  assert.equal(
    reliabilityScore({ attended: 0, noShows: 0, lateCancels: 0 }),
    null
  )
  assert.equal(
    reliabilityScore({ attended: 9, noShows: 1, lateCancels: 0 }),
    90
  )
  assert.equal(
    reliabilityScore({ attended: 9, noShows: 0, lateCancels: 2 }),
    90
  )
})

void test("two no-shows in 30 days restrict joining for 7 days after the latest", () => {
  const now = new Date("2026-11-15T12:00:00Z")
  const day = 24 * 60 * MIN
  assert.equal(restrictedUntil([new Date(now.getTime() - day)], now), null)
  assert.equal(
    restrictedUntil(
      [new Date(now.getTime() - 2 * day), new Date(now.getTime() - 40 * day)],
      now
    ),
    null
  )
  assert.equal(
    restrictedUntil(
      [new Date(now.getTime() - 2 * day), new Date(now.getTime() - 10 * day)],
      now
    ),
    new Date(now.getTime() + 5 * day).toISOString()
  )
})

// ── Server-owned fields on PUT /api/sessions ────────────────────────────────

void test("a client PUT can't write attendance or revive a settled room", () => {
  const prev = selfRoom({
    status: "completed",
    listed: false,
    attendance: { host: { at: "x", via: "gps" } },
    attendanceSettledAt: "2026-11-21T18:00:00+07:00",
  })
  const incoming = selfRoom({
    status: "forming",
    listed: true,
    courtMode: "app",
    ranked: false,
    attendance: { "u-binh": { at: "x", via: "gps" } },
  })
  const next = keepServerOwnedFields(incoming, prev)
  assert.equal(next.status, "completed")
  assert.equal(next.listed, false)
  assert.equal(next.courtMode, "self")
  assert.equal(next.ranked, true)
  assert.deepEqual(next.attendance, prev.attendance)

  const fresh = keepServerOwnedFields(incoming, undefined)
  assert.equal(fresh.attendance, undefined)
})

void test("a confirmed court can't be un-confirmed by a stale client", () => {
  const prev = selfRoom()
  const incoming = selfRoom({
    selfCourt: { ...prev.selfCourt!, confirmed: false },
  })
  assert.equal(keepServerOwnedFields(incoming, prev).selfCourt?.confirmed, true)
})

void test("a self-booked room must name and pin its court", () => {
  assert.doesNotThrow(() => assertValidSelfCourt(selfRoom()))
  assert.throws(
    () =>
      assertValidSelfCourt(
        selfRoom({ selfCourt: { ...selfRoom().selfCourt!, lat: undefined } })
      ),
    BadRequestException
  )
  assert.throws(
    () =>
      assertValidSelfCourt(
        selfRoom({ selfCourt: { ...selfRoom().selfCourt!, costPerPerson: -1 } })
      ),
    BadRequestException
  )
  assert.throws(
    () => assertValidSelfCourt(selfRoom({ reservationId: "bk-1" })),
    BadRequestException
  )
  assert.throws(
    () =>
      assertValidSelfCourt({
        ...selfRoom(),
        courtMode: undefined,
      }),
    BadRequestException
  )
})

// ── SelfCourtService ─────────────────────────────────────────────────────────

interface Doc {
  _id: string
  userId: string
  sessionId: string
  data: PlaySessionData
}

async function makeService(docs: Doc[]) {
  const updates: { filter: unknown; update: Record<string, unknown> }[] = []
  const records: { userId: string; kind: string }[] = []
  const notified: string[] = []
  const model = {
    findOne: ({ sessionId }: { sessionId: string }) =>
      Promise.resolve(docs.find((d) => d.sessionId === sessionId) ?? null),
    find: () => ({ limit: () => ({ lean: () => Promise.resolve(docs) }) }),
    updateOne: (filter: unknown, update: Record<string, unknown>) => {
      updates.push({ filter, update })
      return Promise.resolve({ modifiedCount: 1, matchedCount: 1 })
    },
  }
  const moduleRef = await Test.createTestingModule({
    providers: [
      SelfCourtService,
      { provide: getModelToken(PlaySession.name), useValue: model },
      {
        provide: NotificationsService,
        useValue: {
          create: (id: string) => {
            notified.push(id)
            return Promise.resolve()
          },
        },
      },
      {
        provide: ReliabilityService,
        useValue: {
          record: (userId: string, _s: string, kind: string) => {
            records.push({ userId, kind })
            return Promise.resolve()
          },
        },
      },
      { provide: RoomEventsService, useValue: { emit: () => {} } },
    ],
  }).compile()
  return {
    service: moduleRef.get(SelfCourtService),
    updates,
    records,
    notified,
  }
}

const doc = (data: PlaySessionData): Doc => ({
  _id: "d1",
  userId: "host",
  sessionId: data.id,
  data,
})

void test("check-in near the court inside the window is recorded as GPS", async () => {
  const { service, updates } = await makeService([doc(selfRoom())])
  const mark = await service.checkIn(
    "u-an",
    "room-self",
    { lat: COURT.lat + 0.001, lng: COURT.lng, accuracy: 20 },
    START - 10 * MIN
  )
  assert.equal(mark.via, "gps")
  assert.deepEqual(Object.keys(updates[0].update.$set as object), [
    "data.attendance.u-an",
  ])
})

void test("check-in is refused far away, too early, or for non-members", async () => {
  const { service } = await makeService([doc(selfRoom())])
  await assert.rejects(
    service.checkIn(
      "u-an",
      "room-self",
      { lat: COURT.lat + 0.01, lng: COURT.lng },
      START
    ),
    BadRequestException
  )
  await assert.rejects(
    service.checkIn("u-an", "room-self", COURT, START - 60 * MIN),
    ConflictException
  )
  await assert.rejects(
    service.checkIn("u-chi", "room-self", COURT, START),
    ForbiddenException
  )
  await assert.rejects(
    service.checkIn("u-an", "room-self", { ...COURT, accuracy: 500 }, START),
    BadRequestException
  )
})

void test("only a player already present can vouch for another", async () => {
  const room = selfRoom({ attendance: { host: { at: "x", via: "gps" } } })
  const { service, updates } = await makeService([doc(room)])
  await assert.rejects(
    service.vouch("u-an", "room-self", "u-binh", START + 10 * MIN),
    ForbiddenException
  )
  await service.vouch("host", "room-self", "u-binh", START + 10 * MIN)
  const set = updates[0].update.$set as Record<
    string,
    { via: string; by: string }
  >
  assert.equal(set["data.attendance.u-binh"].via, "vouch")
  assert.equal(set["data.attendance.u-binh"].by, "host")
})

void test("the sweep cancels a room whose court was never confirmed", async () => {
  const room = selfRoom({
    selfCourt: { ...selfRoom().selfCourt!, confirmed: false },
  })
  const { service, records, notified, updates } = await makeService([doc(room)])
  const r = await service.sweep(START - 90 * MIN)
  assert.equal(r.cancelled, 1)
  assert.equal(
    (updates[0].update.$set as Record<string, unknown>)["data.status"],
    "cancelled"
  )
  assert.deepEqual(records, [{ userId: "host", kind: "late_cancel" }])
  assert.deepEqual(notified.sort(), ["host", "u-an", "u-binh"])
})

void test("the sweep reminds the host 6h before an unconfirmed start", async () => {
  const room = selfRoom({
    selfCourt: { ...selfRoom().selfCourt!, confirmed: false },
  })
  const { service, notified } = await makeService([doc(room)])
  const r = await service.sweep(START - 5 * 60 * MIN)
  assert.equal(r.reminded, 1)
  assert.deepEqual(notified, ["host"])
})

void test("settling records attendance and no-shows once the match is proven", async () => {
  const gps = { at: "x", via: "gps" as const }
  const room = selfRoom({ attendance: { host: gps, "u-an": gps } })
  const { service, records } = await makeService([doc(room)])
  const r = await service.sweep(START + (120 + 24 * 60 + 1) * MIN)
  assert.equal(r.settled, 1)
  assert.deepEqual(
    records.sort((a, b) => a.userId.localeCompare(b.userId)),
    [
      { userId: "host", kind: "attended" },
      { userId: "u-an", kind: "attended" },
      { userId: "u-binh", kind: "no_show" },
    ]
  )
})

void test("a match nobody can prove happened records no no-shows", async () => {
  const room = selfRoom({ attendance: { host: { at: "x", via: "gps" } } })
  const { service, records } = await makeService([doc(room)])
  await service.sweep(START + (120 + 24 * 60 + 1) * MIN)
  assert.deepEqual(records, [{ userId: "host", kind: "attended" }])
})
