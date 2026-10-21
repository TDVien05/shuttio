import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { RoomEventsService } from "../src/features/rooms/room-events.service.js"
import { SessionEventsService } from "../src/features/sessions/session-events.service.js"
import type { CentrifugoService } from "../src/features/realtime/centrifugo.service.js"

function fakeCentrifugo() {
  const published: { channel: string; data: unknown }[] = []
  const service = {
    publish: (channel: string, data: unknown) => {
      published.push({ channel, data })
      return Promise.resolve()
    },
  } as unknown as CentrifugoService
  return { service, published }
}

void test("RoomEventsService publishes the room id to the shared channel", () => {
  const { service, published } = fakeCentrifugo()
  new RoomEventsService(service).emit("room-1")
  assert.deepEqual(published, [
    { channel: "rooms:changes", data: { roomId: "room-1" } },
  ])
})

void test("SessionEventsService publishes to the user's own channel", () => {
  const { service, published } = fakeCentrifugo()
  new SessionEventsService(service).emit("user_1")
  assert.deepEqual(published, [
    { channel: "personal:sessions#user_1", data: {} },
  ])
})
