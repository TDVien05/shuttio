import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { Test } from "@nestjs/testing"
import { ConfigService } from "@nestjs/config"
import { getModelToken } from "@nestjs/mongoose"

import { ClerkDirectoryService } from "../src/features/directory/clerk-directory.service.js"
import { MailerService } from "../src/features/notifications/mailer.service.js"
import { NotificationDigestService } from "../src/features/notifications/notification-digest.service.js"
import { NotificationEmailEvent } from "../src/features/notifications/email-outbox.schema.js"

/**
 * The 15-minute digest job: one email per user with pending events, rows
 * deleted only after the send succeeds, nothing sent without SMTP or an email
 * address. Mongo, Clerk and SMTP are all faked.
 */

interface Row {
  _id: number
  userId: string
  kind: string
  text: string
  actorName?: string
}

function makeFakes(rows: Row[], opts: { smtp: boolean; failFor?: string }) {
  let remaining = [...rows]
  const sent: { to: string; subject: string; text: string }[] = []
  const deleted: number[] = []
  const emailModel = {
    distinct: () =>
      Promise.resolve([...new Set(remaining.map((r) => r.userId))]),
    find: (filter: { userId: string }) => ({
      sort: () => ({
        lean: () =>
          Promise.resolve(remaining.filter((r) => r.userId === filter.userId)),
      }),
    }),
    deleteMany: (filter: { _id: { $in: number[] } }) => {
      deleted.push(...filter._id.$in)
      remaining = remaining.filter((r) => !filter._id.$in.includes(r._id))
      return Promise.resolve({ deletedCount: filter._id.$in.length })
    },
  }
  const directory = {
    primaryEmail: (userId: string) => Promise.resolve(`${userId}@example.test`),
  }
  const mailer = {
    enabled: opts.smtp,
    send: (to: string, subject: string, text: string) => {
      if (opts.failFor && to.startsWith(opts.failFor)) {
        return Promise.reject(new Error("smtp down"))
      }
      sent.push({ to, subject, text })
      return Promise.resolve()
    },
  }
  return {
    emailModel,
    directory,
    mailer,
    sent,
    deleted,
    remainingIds: () => remaining.map((r) => r._id),
  }
}

async function makeService(fakes: ReturnType<typeof makeFakes>) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      NotificationDigestService,
      {
        provide: getModelToken(NotificationEmailEvent.name),
        useValue: fakes.emailModel,
      },
      { provide: ClerkDirectoryService, useValue: fakes.directory },
      { provide: MailerService, useValue: fakes.mailer },
      {
        provide: ConfigService,
        useValue: { getOrThrow: () => "https://shuttio.test,http://other" },
      },
    ],
  }).compile()
  return moduleRef.get(NotificationDigestService)
}

void test("one summary email per user, and only that user's events are deleted", async () => {
  const fakes = makeFakes(
    [
      { _id: 1, userId: "u1", kind: "chat", text: "x", actorName: "Nguyễn A" },
      { _id: 2, userId: "u1", kind: "chat", text: "x", actorName: "Nguyễn A" },
      { _id: 3, userId: "u2", kind: "booking", text: "Đơn đã duyệt" },
    ],
    { smtp: true }
  )
  const service = await makeService(fakes)

  const result = await service.run()

  assert.deepEqual(result, { sent: 2, skipped: 0, failed: 0 })
  assert.equal(fakes.sent.length, 2)
  const u1 = fakes.sent.find((m) => m.to === "u1@example.test")
  assert.match(u1?.text ?? "", /Nguyễn A đã gửi 2 tin nhắn cho bạn/)
  assert.deepEqual(fakes.remainingIds(), [])
  assert.deepEqual(fakes.deleted.sort(), [1, 2, 3])
})

void test("a failed send keeps that user's events for the next tick", async () => {
  const fakes = makeFakes(
    [
      { _id: 1, userId: "u1", kind: "booking", text: "a" },
      { _id: 2, userId: "u2", kind: "booking", text: "b" },
    ],
    { smtp: true, failFor: "u1" }
  )
  const service = await makeService(fakes)

  const result = await service.run()

  assert.deepEqual(result, { sent: 1, skipped: 0, failed: 1 })
  assert.deepEqual(fakes.remainingIds(), [1])
})

void test("does nothing when SMTP is not configured", async () => {
  const fakes = makeFakes(
    [{ _id: 1, userId: "u1", kind: "booking", text: "a" }],
    {
      smtp: false,
    }
  )
  const service = await makeService(fakes)

  const result = await service.run()

  assert.deepEqual(result, { sent: 0, skipped: 0, failed: 0 })
  assert.deepEqual(fakes.remainingIds(), [1])
})

void test("the digest link is the first configured web origin", async () => {
  const fakes = makeFakes(
    [{ _id: 1, userId: "u1", kind: "booking", text: "a" }],
    {
      smtp: true,
    }
  )
  const service = await makeService(fakes)

  await service.run()

  assert.match(fakes.sent[0]?.text ?? "", /https:\/\/shuttio\.test$/m)
})
