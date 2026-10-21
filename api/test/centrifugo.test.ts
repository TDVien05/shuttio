import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { test } from "node:test"

import "reflect-metadata"

import type { ConfigService } from "@nestjs/config"

import { CentrifugoService } from "../src/features/realtime/centrifugo.service.js"

const config = (values: Record<string, string>) =>
  ({
    getOrThrow: (key: string) => values[key],
  }) as unknown as ConfigService

void test("connectionToken is an HS256 JWT with sub, iss, aud, iat and a short exp", () => {
  const svc = new CentrifugoService(
    config({ CENTRIFUGO_TOKEN_HMAC_SECRET: "secret" })
  )
  const { token, expiresAt } = svc.connectionToken("user_1")
  const [header, payload, signature] = token.split(".")

  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url").toString()), {
    alg: "HS256",
    typ: "JWT",
  })
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
    iat: number
  }
  assert.deepEqual(claims, {
    sub: "user_1",
    iss: "shuttio-api",
    aud: "centrifugo",
    iat: claims.iat,
    exp: expiresAt,
  })
  // Short-lived: the client refreshes it, so a leaked token dies in minutes.
  assert.equal(expiresAt - claims.iat, 600)
  const expected = createHmac("sha256", "secret")
    .update(`${header}.${payload}`)
    .digest("base64url")
  assert.equal(signature, expected)
})

void test("publish posts the publish command with the API key", async () => {
  let seen: { key?: string; body?: unknown } = {}
  const server = createServer((req, res) => {
    let body = ""
    req.on("data", (chunk) => (body += chunk))
    req.on("end", () => {
      seen = {
        key: req.headers["x-api-key"] as string,
        body: JSON.parse(body),
      }
      res.end('{"result":{}}')
    })
  })
  await new Promise<void>((r) => server.listen(0, r))
  try {
    const port = (server.address() as AddressInfo).port
    const svc = new CentrifugoService(
      config({
        CENTRIFUGO_API_URL: `http://127.0.0.1:${port}/api`,
        CENTRIFUGO_API_KEY: "k",
      })
    )
    await svc.publish("rooms:changes", { roomId: "r1" })
    assert.deepEqual(seen, {
      key: "k",
      body: {
        method: "publish",
        params: { channel: "rooms:changes", data: { roomId: "r1" } },
      },
    })
  } finally {
    server.close()
  }
})

void test("disconnect asks Centrifugo to drop the user's connections", async () => {
  let body: unknown
  const server = createServer((req, res) => {
    let raw = ""
    req.on("data", (chunk) => (raw += chunk))
    req.on("end", () => {
      body = JSON.parse(raw)
      res.end('{"result":{}}')
    })
  })
  await new Promise<void>((r) => server.listen(0, r))
  try {
    const port = (server.address() as AddressInfo).port
    const svc = new CentrifugoService(
      config({
        CENTRIFUGO_API_URL: `http://127.0.0.1:${port}/api`,
        CENTRIFUGO_API_KEY: "k",
      })
    )
    await svc.disconnect("user_1")
    assert.deepEqual(body, { method: "disconnect", params: { user: "user_1" } })
  } finally {
    server.close()
  }
})

void test("publish swallows an unreachable server", async () => {
  const svc = new CentrifugoService(
    config({
      CENTRIFUGO_API_URL: "http://127.0.0.1:1/api",
      CENTRIFUGO_API_KEY: "k",
    })
  )
  await svc.publish("rooms:changes", {})
})
