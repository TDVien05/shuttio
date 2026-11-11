import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { ConflictException, ServiceUnavailableException } from "@nestjs/common"

import {
  VenueAccountService,
  generatePassword,
} from "../src/features/admin/venue-account.service.js"

function build(opts: {
  mail?: boolean
  exists?: boolean
  sendFails?: boolean
}) {
  const calls = {
    created: 0,
    deleted: 0,
    sent: [] as string[],
    types: [] as string[],
  }
  const clerk = {
    users: {
      getUserList: async () => ({ data: opts.exists ? [{ id: "x" }] : [] }),
      createUser: async () => {
        calls.created++
        return { id: "user_1" }
      },
      deleteUser: async () => {
        calls.deleted++
      },
    },
  }
  const mailer = {
    enabled: opts.mail ?? true,
    send: async (_to: string, _s: string, text: string) => {
      if (opts.sendFails) throw new Error("smtp down")
      calls.sent.push(text)
    },
  }
  const profiles = {
    setAccountType: async (_id: string, t: string) => {
      calls.types.push(t)
    },
  }
  const config = { get: () => "http://localhost:3000" }
  const svc = new VenueAccountService(
    clerk as never,
    mailer as never,
    profiles as never,
    config as never
  )
  return { svc, calls }
}

void test("generatePassword has all character classes", () => {
  const p = generatePassword()
  assert.equal(p.length, 16)
  assert.match(p, /[a-z]/)
  assert.match(p, /[A-Z]/)
  assert.match(p, /\d/)
  assert.match(p, /[!@#$%*?]/)
})

void test("creates the account, marks it venue and emails the password", async () => {
  const { svc, calls } = build({})
  const out = await svc.create({ email: "a@b.vn", name: "Sân A" })
  assert.deepEqual(out, { userId: "user_1", email: "a@b.vn" })
  assert.deepEqual(calls.types, ["venue"])
  assert.equal(calls.sent.length, 1)
  assert.match(calls.sent[0], /Mật khẩu tạm thời: \S{16}/)
})

void test("refuses when SMTP is not configured or the email exists", async () => {
  await assert.rejects(
    build({ mail: false }).svc.create({ email: "a@b.vn" }),
    ServiceUnavailableException
  )
  await assert.rejects(
    build({ exists: true }).svc.create({ email: "a@b.vn" }),
    ConflictException
  )
})

void test("rolls the Clerk user back when the email fails", async () => {
  const { svc, calls } = build({ sendFails: true })
  await assert.rejects(
    svc.create({ email: "a@b.vn" }),
    ServiceUnavailableException
  )
  assert.equal(calls.deleted, 1)
})
