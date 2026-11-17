import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common"
import { Test } from "@nestjs/testing"
import { getModelToken } from "@nestjs/mongoose"

import { RatingsService } from "../src/features/ratings/ratings.service.js"
import { Rating } from "../src/features/ratings/rating.schema.js"
import { PlaySession } from "../src/features/sessions/session.schema.js"
import { NotificationsService } from "../src/features/notifications/notifications.service.js"
import type { PlaySession as PlaySessionData } from "../src/shared/index.js"

/**
 * Peer ratings after a played match: only participants of a finished,
 * non-cancelled match may rate each other, once per (rater, ratee, match);
 * the ratee is notified; profiles read an average + newest reviews. Reviews
 * are anonymous — nothing sent to the ratee or a profile names the rater.
 */

function playedSession(
  overrides: Partial<PlaySessionData> = {}
): PlaySessionData {
  return {
    id: "s-1",
    title: "Trận tối",
    sport: "badminton",
    format: "Doubles",
    courtId: "c1",
    dayKey: "2020-01-01",
    dayLabel: "",
    slot: "18:00",
    durationMin: 60,
    courtLabel: null,
    host: { name: "Host", initials: "HO" },
    capacity: 4,
    roster: [
      { name: "Host", initials: "HO", rsvp: "host" },
      { name: "An", initials: "AN", rsvp: "going", userId: "user-an" },
      { name: "Bình", initials: "BI", rsvp: "pending", userId: "user-bi" },
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

async function makeService(opts: {
  session?: PlaySessionData | null
  createFails?: Error
  ratings?: { rateeId: string; stars: number }[]
  aggregate?: { average: number; count: number }[]
  recent?: {
    stars: number
    comment?: string
    raterId?: string
    _id?: string
    createdAt: Date
  }[]
}) {
  /** Filters passed to `ratingModel.find`, in call order. */
  const finds: Record<string, unknown>[] = []
  const created: unknown[] = []
  const notified: {
    userId: string
    input: { id: string; kind: string; text: string }
  }[] = []
  const ratingModel = {
    create(doc: unknown) {
      if (opts.createFails) return Promise.reject(opts.createFails)
      created.push(doc)
      return Promise.resolve(doc)
    },
    find: (filter: Record<string, unknown>) => {
      finds.push(filter)
      return findChain
    },
    aggregate: () => Promise.resolve(opts.aggregate ?? []),
  }
  const findChain = {
    select: () => ({
      lean: () => Promise.resolve(opts.ratings ?? []),
      sort: () => ({
        limit: () => ({ lean: () => Promise.resolve(opts.recent ?? []) }),
      }),
    }),
  }
  const sessionModel = {
    findOne: () => ({
      sort: () => ({
        lean: () =>
          Promise.resolve(
            opts.session === null
              ? null
              : { userId: "host-1", data: opts.session ?? playedSession() }
          ),
      }),
    }),
  }
  const moduleRef = await Test.createTestingModule({
    providers: [
      RatingsService,
      { provide: getModelToken(Rating.name), useValue: ratingModel },
      { provide: getModelToken(PlaySession.name), useValue: sessionModel },
      {
        provide: NotificationsService,
        useValue: {
          create: (
            userId: string,
            input: { id: string; kind: string; text: string }
          ) => {
            notified.push({ userId, input })
            return Promise.resolve()
          },
        },
      },
    ],
  }).compile()
  return { service: moduleRef.get(RatingsService), created, notified, finds }
}

void test("rate: a participant rates another after the match, and the ratee is notified", async () => {
  const { service, created, notified } = await makeService({})
  await service.rate("host-1", {
    sessionId: "s-1",
    rateeId: "user-an",
    stars: 5,
    comment: "  Đánh hay!  ",
  })
  assert.deepEqual(created, [
    {
      raterId: "host-1",
      rateeId: "user-an",
      sessionId: "s-1",
      stars: 5,
      comment: "Đánh hay!",
    },
  ])
  assert.equal(notified.length, 1)
  assert.equal(notified[0].userId, "user-an")
  assert.equal(notified[0].input.kind, "rating")
  // Anonymous: neither the notification's text nor its id names the rater.
  assert.equal(notified[0].input.text.includes("host-1"), false)
  assert.equal(notified[0].input.id.includes("host-1"), false)
})

void test("rate rejects self-rating, unknown/cancelled/unfinished matches and outsiders", async () => {
  const ok = await makeService({})
  await assert.rejects(
    ok.service.rate("user-an", {
      sessionId: "s-1",
      rateeId: "user-an",
      stars: 4,
    }),
    BadRequestException
  )
  // A pending invitee never played.
  await assert.rejects(
    ok.service.rate("user-bi", {
      sessionId: "s-1",
      rateeId: "user-an",
      stars: 4,
    }),
    ForbiddenException
  )
  await assert.rejects(
    ok.service.rate("host-1", {
      sessionId: "s-1",
      rateeId: "user-bi",
      stars: 4,
    }),
    BadRequestException
  )

  const missing = await makeService({ session: null })
  await assert.rejects(
    missing.service.rate("host-1", {
      sessionId: "x",
      rateeId: "user-an",
      stars: 4,
    }),
    NotFoundException
  )

  const cancelled = await makeService({
    session: playedSession({ status: "cancelled" }),
  })
  await assert.rejects(
    cancelled.service.rate("host-1", {
      sessionId: "s-1",
      rateeId: "user-an",
      stars: 4,
    }),
    BadRequestException
  )

  const future = await makeService({
    session: playedSession({ dayKey: "2999-01-01" }),
  })
  await assert.rejects(
    future.service.rate("host-1", {
      sessionId: "s-1",
      rateeId: "user-an",
      stars: 4,
    }),
    BadRequestException
  )
})

void test("rate maps a duplicate (already rated) to 409", async () => {
  const { service, notified } = await makeService({
    createFails: Object.assign(new Error("dup"), { code: 11000 }),
  })
  await assert.rejects(
    service.rate("host-1", { sessionId: "s-1", rateeId: "user-an", stars: 3 }),
    ConflictException
  )
  assert.equal(notified.length, 0)
})

void test("mine lists who the caller rated in a match", async () => {
  const { service } = await makeService({
    ratings: [{ rateeId: "user-an", stars: 4 }],
  })
  assert.deepEqual(await service.mine("host-1", "s-1"), [
    { rateeId: "user-an", stars: 4 },
  ])
})

void test("summary: empty for an unrated player, else rounded average + newest reviews", async () => {
  const empty = await makeService({})
  assert.deepEqual(await empty.service.summary("u"), {
    average: 0,
    count: 0,
    recent: [],
  })

  const rated = await makeService({
    aggregate: [{ average: 4.666, count: 3 }],
    recent: [
      {
        stars: 5,
        comment: "Tuyệt",
        raterId: "user-an",
        createdAt: new Date("2026-10-01T10:00:00Z"),
      },
      {
        stars: 4,
        raterId: "user-binh",
        createdAt: new Date("2026-09-30T10:00:00Z"),
      },
    ],
  })
  const s = await rated.service.summary("u")
  assert.equal(s.average, 4.7)
  assert.equal(s.count, 3)
  // Anonymous: a review carries no rater id or name, even if the doc has one.
  assert.deepEqual(s.recent[0], {
    stars: 5,
    comment: "Tuyệt",
    createdAt: "2026-10-01T10:00:00.000Z",
  })
  assert.equal("comment" in s.recent[1], false)
})

void test("reviews: pages newest-first, anonymous, with a cursor while older ones remain", async () => {
  const doc = (i: number) => ({
    _id: i.toString(16).padStart(24, "0"),
    stars: 5,
    raterId: "user-an",
    createdAt: new Date(Date.UTC(2026, 9, 20) - i * 60_000),
  })
  // One row more than a page: an older page exists.
  const full = await makeService({
    recent: Array.from({ length: 11 }, (_, i) => doc(i)),
  })
  const first = await full.service.reviews("u")
  assert.equal(first.reviews.length, 10)
  assert.deepEqual(first.reviews[0], {
    stars: 5,
    createdAt: doc(0).createdAt.toISOString(),
  })
  // The cursor points at the last review RETURNED, not the extra row.
  assert.equal(first.nextCursor, `${doc(9).createdAt.getTime()}_${doc(9)._id}`)
  assert.deepEqual(full.finds[0], { rateeId: "u" })

  // The next page reads strictly older reviews than the cursor.
  await full.service.reviews("u", first.nextCursor)
  const next = full.finds[1] as { rateeId: string; $or: unknown[] }
  assert.equal(next.rateeId, "u")
  assert.equal(next.$or.length, 2)
  assert.deepEqual(next.$or[0], { createdAt: { $lt: doc(9).createdAt } })

  // A short page is the last one.
  const short = await makeService({ recent: [doc(0), doc(1)] })
  const last = await short.service.reviews("u")
  assert.equal(last.reviews.length, 2)
  assert.equal("nextCursor" in last, false)
})
