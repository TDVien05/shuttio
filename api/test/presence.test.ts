import assert from "node:assert/strict"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { test } from "node:test"

import "reflect-metadata"

import type { ConfigService } from "@nestjs/config"
import { getModelToken } from "@nestjs/mongoose"
import { Test } from "@nestjs/testing"

import { CentrifugoService } from "../src/features/realtime/centrifugo.service.js"
import {
  LAST_SEEN_WRITE_INTERVAL_MS,
  PRESENCE_MAX_USERS,
  PresenceService,
} from "../src/features/realtime/presence.service.js"
import { UserPresence } from "../src/features/realtime/user-presence.schema.js"

/**
 * Presence: "online" is read live from Centrifugo (one batched
 * presence_stats call over each user's own notifications channel), "last
 * seen" from a small throttled store. A Centrifugo outage degrades to
 * "nobody online" rather than failing.
 */

const config = (values: Record<string, string>) =>
  ({
    getOrThrow: (key: string) => values[key],
  }) as unknown as ConfigService

/** A stand-in Centrifugo HTTP API answering every request with `reply`. */
async function fakeCentrifugo(reply: (body: unknown) => unknown) {
  const seen: { url?: string; key?: string; body?: unknown }[] = []
  const server = createServer((req, res) => {
    let body = ""
    req.on("data", (chunk) => (body += chunk))
    req.on("end", () => {
      const parsed: unknown = JSON.parse(body)
      seen.push({
        url: req.url,
        key: req.headers["x-api-key"] as string,
        body: parsed,
      })
      res.end(JSON.stringify(reply(parsed)))
    })
  })
  await new Promise<void>((r) => server.listen(0, r))
  const port = (server.address() as AddressInfo).port
  const service = new CentrifugoService(
    config({
      CENTRIFUGO_API_URL: `http://127.0.0.1:${port}/api`,
      CENTRIFUGO_API_KEY: "key",
    })
  )
  return {
    service,
    seen,
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}

void test("onlineUsers batches presence_stats per user and reads num_clients", async () => {
  const c = await fakeCentrifugo(() => ({
    replies: [
      { presence_stats: { num_clients: 2, num_users: 1 } },
      { presence_stats: { num_clients: 0, num_users: 0 } },
    ],
  }))
  try {
    const online = await c.service.onlineUsers(["user_a", "user_b"])
    assert.deepEqual([...(online ?? [])], ["user_a"])
    assert.equal(c.seen[0].url, "/api/batch")
    assert.equal(c.seen[0].key, "key")
    assert.deepEqual(c.seen[0].body, {
      commands: [
        { presence_stats: { channel: "personal:notifications#user_a" } },
        { presence_stats: { channel: "personal:notifications#user_b" } },
      ],
      parallel: true,
    })
    // Nothing to ask → no request at all.
    assert.deepEqual([...((await c.service.onlineUsers([])) ?? [])], [])
    assert.equal(c.seen.length, 1)
  } finally {
    await c.close()
  }
})

void test("onlineUsers is null (unknown) on an error reply or an unreachable server", async () => {
  const off = await fakeCentrifugo(() => ({
    replies: [{ error: { code: 108, message: "not available" } }],
  }))
  try {
    assert.equal(await off.service.onlineUsers(["user_a"]), null)
  } finally {
    await off.close()
  }
  const down = new CentrifugoService(
    config({
      CENTRIFUGO_API_URL: "http://127.0.0.1:1/api",
      CENTRIFUGO_API_KEY: "key",
    })
  )
  assert.equal(await down.onlineUsers(["user_a"]), null)
})

// ── PresenceService ────────────────────────────────────────────────────

interface Row {
  userId: string
  lastSeenAt: Date
}

/** In-memory `user_presence` supporting the two finds and the bulk upsert. */
function makePresenceModel(seed: Row[] = []) {
  const rows = seed.map((r) => ({ ...r }))
  let writes = 0
  return {
    rows,
    writes: () => writes,
    find: (f: { userId: { $in: string[] }; lastSeenAt?: { $gt: Date } }) => ({
      select: () => ({
        lean: () =>
          Promise.resolve(
            rows.filter(
              (r) =>
                f.userId.$in.includes(r.userId) &&
                (!f.lastSeenAt || r.lastSeenAt > f.lastSeenAt.$gt)
            )
          ),
      }),
    }),
    bulkWrite: (
      ops: {
        updateOne: {
          filter: { userId: string }
          update: { $set: { lastSeenAt: Date } }
        }
      }[]
    ) => {
      for (const { updateOne } of ops) {
        writes += 1
        const row = rows.find((r) => r.userId === updateOne.filter.userId)
        if (row) row.lastSeenAt = updateOne.update.$set.lastSeenAt
        else rows.push({ ...updateOne.filter, ...updateOne.update.$set })
      }
      return Promise.resolve({})
    },
  }
}

async function makePresence(online: string[] | null, seed: Row[] = []) {
  const model = makePresenceModel(seed)
  const asked: string[][] = []
  const moduleRef = await Test.createTestingModule({
    providers: [
      PresenceService,
      { provide: getModelToken(UserPresence.name), useValue: model },
      {
        provide: CentrifugoService,
        useValue: {
          onlineUsers: (ids: string[]) => {
            asked.push(ids)
            return Promise.resolve(online ? new Set(online) : null)
          },
        },
      },
    ],
  }).compile()
  return { service: moduleRef.get(PresenceService), model, asked }
}

const NOW = new Date("2026-11-14T10:00:00Z")
const ago = (ms: number) => new Date(NOW.getTime() - ms)

void test("statuses: online users are live, offline ones carry their stored last seen", async () => {
  const { service, model } = await makePresence(
    ["user_a"],
    [{ userId: "user_b", lastSeenAt: ago(5 * 60_000) }]
  )
  assert.deepEqual(
    await service.statuses("viewer", ["user_a", "user_b", "user_c"], NOW),
    [
      { userId: "user_a", online: true, lastSeenAt: NOW.toISOString() },
      {
        userId: "user_b",
        online: false,
        lastSeenAt: ago(5 * 60_000).toISOString(),
      },
      // Never seen at all.
      { userId: "user_c", online: false, lastSeenAt: null },
    ]
  )
  // Asking marks the viewer, and anyone seen online, as around right now.
  const seenNow = model.rows
    .filter((r) => r.lastSeenAt.getTime() === NOW.getTime())
    .map((r) => r.userId)
    .sort()
  assert.deepEqual(seenNow, ["user_a", "viewer"])
})

void test("statuses dedupes and caps the ids it asks Centrifugo about", async () => {
  const { service, asked } = await makePresence([])
  const many = Array.from(
    { length: PRESENCE_MAX_USERS + 20 },
    (_, i) => `u${i}`
  )
  const res = await service.statuses("viewer", ["u0", "u0", ...many], NOW)
  assert.equal(res.length, PRESENCE_MAX_USERS)
  assert.equal(asked[0].length, PRESENCE_MAX_USERS)
  assert.equal(new Set(asked[0]).size, PRESENCE_MAX_USERS)
})

void test("a Centrifugo outage reports nobody online but keeps last seen", async () => {
  const { service } = await makePresence(null, [
    { userId: "user_a", lastSeenAt: ago(60_000) },
  ])
  assert.deepEqual(await service.statuses("viewer", ["user_a"], NOW), [
    { userId: "user_a", online: false, lastSeenAt: ago(60_000).toISOString() },
  ])
})

void test("touch writes at most once per user per interval", async () => {
  const { service, model } = await makePresence(
    [],
    [
      { userId: "fresh", lastSeenAt: ago(LAST_SEEN_WRITE_INTERVAL_MS - 1_000) },
      { userId: "stale", lastSeenAt: ago(LAST_SEEN_WRITE_INTERVAL_MS + 1_000) },
    ]
  )
  await service.touch(["fresh", "stale", "new"], NOW)
  assert.equal(model.writes(), 2)
  const at = (id: string) =>
    model.rows.find((r) => r.userId === id)?.lastSeenAt.getTime()
  assert.equal(at("fresh"), ago(LAST_SEEN_WRITE_INTERVAL_MS - 1_000).getTime())
  assert.equal(at("stale"), NOW.getTime())
  assert.equal(at("new"), NOW.getTime())

  // Nothing due → no write.
  await service.touch(["fresh", "stale", "new"], NOW)
  assert.equal(model.writes(), 2)
})
