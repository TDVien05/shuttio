// Seed test data for anonymous peer ratings: a community group chat whose
// members have just finished a match together, so each of them can open the
// group's info dialog and rate the others.
//
//   cd api
//   node --import tsx scripts/seed-rating-test.ts <user> <user> [<user> ...]
//   node --import tsx scripts/seed-rating-test.ts --with-ratings <user> <user>
//   node --import tsx scripts/seed-rating-test.ts --clean
//
// Each <user> is a REAL account, given as its sign-in email or its Clerk id
// (`user_...`). The first one hosts the match. 2–4 users.
//
//   --with-ratings  also record a review from every other player to the host,
//                   so the host's profile shows anonymous reviews straight away
//                   (the host can still rate everyone).
//   --clean         delete everything this script ever created, and nothing else.
//
// Reads DATABASE_URL and CLERK_SECRET_KEY from api/.env — it writes to the
// same database the server uses, so check the database name it prints. Every
// record it creates is tagged (`group-seedrating…` / `seed-rating-…`), which is
// what --clean removes — along with the "rated you" notifications raised by
// ratings given in those matches. Re-running creates a fresh group each time.

import "dotenv/config"
import "reflect-metadata"

import { randomUUID } from "node:crypto"

import { createClerkClient } from "@clerk/express"
import mongoose from "mongoose"

import {
  ChatChannel,
  ChatChannelSchema,
  ChatMember,
  ChatMemberSchema,
  ChatMessage,
  ChatMessageSchema,
} from "../src/features/chat/chat.schema.js"
import {
  Notification,
  NotificationSchema,
} from "../src/features/notifications/notification.schema.js"
import { Rating, RatingSchema } from "../src/features/ratings/rating.schema.js"
import {
  PlaySession,
  PlaySessionSchema,
} from "../src/features/sessions/session.schema.js"
import {
  combineDateTime,
  initialsOf,
  type PlaySession as PlaySessionData,
} from "../src/shared/index.js"

/** Tags on everything this script creates — what `--clean` matches. */
const CHANNEL_PREFIX = "group-seedrating"
const SESSION_PREFIX = "seed-rating-"

const MIN_USERS = 2
const MAX_USERS = 4

interface SeedUser {
  id: string
  name: string
}

function fail(message: string): never {
  console.error(`✖ ${message}`)
  process.exit(1)
}

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")))
const userArgs = process.argv.slice(2).filter((a) => !a.startsWith("--"))
const unknown = [...flags].filter(
  (f) => f !== "--clean" && f !== "--with-ratings"
)
if (unknown.length) fail(`Tham số không hợp lệ: ${unknown.join(", ")}`)

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) fail("DATABASE_URL chưa được đặt (api/.env)")

await mongoose.connect(DATABASE_URL, { serverSelectionTimeoutMS: 8000 })
console.log(`Cơ sở dữ liệu: ${mongoose.connection.name}`)

const channels = mongoose.model(ChatChannel.name, ChatChannelSchema)
const members = mongoose.model(ChatMember.name, ChatMemberSchema)
const messages = mongoose.model(ChatMessage.name, ChatMessageSchema)
const sessions = mongoose.model(PlaySession.name, PlaySessionSchema)
const ratings = mongoose.model(Rating.name, RatingSchema)
const notifications = mongoose.model(Notification.name, NotificationSchema)

try {
  if (flags.has("--clean")) await clean()
  else await seed()
} finally {
  await mongoose.disconnect()
}

/** Remove every record a previous run created. */
async function clean(): Promise<void> {
  const channelFilter = { channelId: { $regex: `^${CHANNEL_PREFIX}` } }
  const sessionFilter = { sessionId: { $regex: `^${SESSION_PREFIX}` } }
  const removed = {
    // "X rated you" notifications raised while testing: `RatingsService`
    // builds their id as `rating-<sessionId>-<uuid>`.
    notifications: (
      await notifications.deleteMany({
        notifId: { $regex: `^rating-${SESSION_PREFIX}` },
      })
    ).deletedCount,
    ratings: (await ratings.deleteMany(sessionFilter)).deletedCount,
    sessions: (await sessions.deleteMany(sessionFilter)).deletedCount,
    messages: (await messages.deleteMany(channelFilter)).deletedCount,
    members: (await members.deleteMany(channelFilter)).deletedCount,
    channels: (await channels.deleteMany(channelFilter)).deletedCount,
  }
  console.log("✔ Đã xoá dữ liệu test:", removed)
}

async function seed(): Promise<void> {
  if (userArgs.length < MIN_USERS || userArgs.length > MAX_USERS) {
    fail(
      `Cần ${MIN_USERS}–${MAX_USERS} tài khoản (email hoặc Clerk id), ví dụ:\n` +
        "  node --import tsx scripts/seed-rating-test.ts a@gmail.com b@gmail.com"
    )
  }
  const users = await resolveUsers(userArgs)
  if (new Set(users.map((u) => u.id)).size !== users.length) {
    fail("Các tài khoản phải khác nhau")
  }
  const [host, ...others] = users

  const tag = randomUUID().replaceAll("-", "").slice(0, 12)
  const channelId = `${CHANNEL_PREFIX}${tag}`
  const sessionId = `${SESSION_PREFIX}${tag}`
  const now = new Date()

  // A one-hour match that ended an hour ago (Asia/Ho_Chi_Minh wall time).
  const start = new Date(now.getTime() - 2 * 3_600_000)
  const local = new Date(start.getTime() + 7 * 3_600_000).toISOString()
  const dayKey = local.slice(0, 10)
  const slot = local.slice(11, 16)
  const durationMin = 60
  const startAt = combineDateTime(dayKey, slot)
  const endAt = new Date(Date.parse(startAt) + durationMin * 60_000)
  const title = `[TEST] Trận đánh giá ${slot}`

  const data: PlaySessionData = {
    id: sessionId,
    title,
    sport: "badminton",
    format: users.length > 2 ? "Doubles" : "Singles",
    courtId: null,
    dayKey,
    dayLabel: dayKey,
    slot,
    durationMin,
    startAt,
    endAt: endAt.toISOString(),
    courtLabel: "Sân 1",
    host: { name: host.name, initials: initialsOf(host.name) },
    capacity: users.length,
    roster: [
      { name: host.name, initials: initialsOf(host.name), rsvp: "host" },
      ...others.map((u) => ({
        name: u.name,
        initials: initialsOf(u.name),
        rsvp: "going" as const,
        userId: u.id,
      })),
    ],
    level: "any",
    // "completed" is what makes the match rateable (`isSessionEnded`).
    status: "completed",
    listed: false,
    fillIntent: "invite",
    venue: "Sân test đánh giá",
    ward: "",
    distanceKm: null,
    pricePerHour: 0,
    // Links the session to the group chat (`RoomsService#groupMatch`).
    chatChannelId: channelId,
  }

  await channels.create({
    channelId,
    kind: "group",
    name: `[TEST] Nhóm đánh giá ${slot}`,
    createdBy: host.id,
    frozen: false,
    lastMessageAt: now,
    lastMessage: {
      senderId: host.id,
      text: "Trận đã kết thúc — hãy đánh giá nhau nhé!",
      hasImage: false,
    },
  })
  await members.insertMany(
    users.map((u) => ({ channelId, userId: u.id, lastReadAt: now }))
  )
  await messages.create({
    channelId,
    senderId: host.id,
    text: "Trận đã kết thúc — hãy đánh giá nhau nhé!",
  })
  await sessions.create({ userId: host.id, sessionId, data })

  if (flags.has("--with-ratings")) {
    const comments = [
      "Đánh rất fair-play, giao lưu vui.",
      "Di chuyển tốt, phối hợp ăn ý.",
      "Đúng giờ và thân thiện.",
    ]
    await ratings.insertMany(
      others.map((u, i) => ({
        raterId: u.id,
        rateeId: host.id,
        sessionId,
        stars: 5 - (i % 2),
        comment: comments[i % comments.length],
      }))
    )
  }

  console.log("✔ Đã tạo dữ liệu test")
  console.log(`  Nhóm chat : [TEST] Nhóm đánh giá ${slot}  (${channelId})`)
  console.log(`  Trận      : ${title}  (${sessionId})`)
  console.log(`  Chủ trận  : ${host.name}`)
  for (const u of others) console.log(`  Người chơi: ${u.name}`)
  if (flags.has("--with-ratings")) {
    console.log(
      `  Đã có ${others.length} đánh giá ẩn danh cho ${host.name} — xem trên hồ sơ.`
    )
  }
  console.log(
    "\nĐăng nhập bằng một trong các tài khoản trên → Trò chuyện → mở nhóm\n" +
      "→ thông tin nhóm → bấm “Đánh giá” cạnh tên thành viên.\n" +
      "Dọn dữ liệu: node --import tsx scripts/seed-rating-test.ts --clean"
  )
}

/** Look each argument up in Clerk — by email when it has an "@", else by id. */
async function resolveUsers(args: string[]): Promise<SeedUser[]> {
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) fail("CLERK_SECRET_KEY chưa được đặt (api/.env)")
  const clerk = createClerkClient({ secretKey })

  const found: SeedUser[] = []
  for (const arg of args) {
    const user = arg.includes("@")
      ? (await clerk.users.getUserList({ emailAddress: [arg], limit: 1 }))
          .data[0]
      : await clerk.users.getUser(arg).catch(() => undefined)
    if (!user) fail(`Không tìm thấy tài khoản Clerk: ${arg}`)
    const name =
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
      user.username ||
      user.primaryEmailAddress?.emailAddress.split("@")[0] ||
      user.id
    found.push({ id: user.id, name })
  }
  return found
}
