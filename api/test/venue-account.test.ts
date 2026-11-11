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
      getUserList: () =>
        Promise.resolve({ data: opts.exists ? [{ id: "x" }] : [] }),
      createUser: () => {
        calls.created++
        return Promise.resolve({ id: "user_1" })
      },
      deleteUser: () => {
        calls.deleted++
        return Promise.resolve()
      },
    },
  }
  const mailer = {
    enabled: opts.mail ?? true,
    send: (_to: string, _s: string, text: string) => {
      if (opts.sendFails) return Promise.reject(new Error("smtp down"))
      calls.sent.push(text)
      return Promise.resolve()
    },
  }
  const profiles = {
    setAccountType: (_id: string, t: string) => {
      calls.types.push(t)
      return Promise.resolve()
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

void test("generatePassword is 8 digits", () => {
  const p = generatePassword()
  assert.match(p, /^\d{8}$/)
  assert.match(p, /\d/)
})

void test("creates the account, marks it venue and emails the password", async () => {
  const { svc, calls } = build({})
  const out = await svc.create({ email: "a@b.vn", name: "Sân A" })
  assert.deepEqual(out, { userId: "user_1", email: "a@b.vn" })
  assert.deepEqual(calls.types, ["venue"])
  assert.equal(calls.sent.length, 1)
  assert.match(calls.sent[0], /Mật khẩu tạm thời: \d{8}/)
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
