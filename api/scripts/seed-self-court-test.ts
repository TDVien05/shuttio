// Seed test data for self-booked rooms (`courtMode: "self"`): players booked a
// court outside the app, meet through the room, check in on site, then rate
// each other. Each scenario puts real accounts into a room at the moment the
// feature under test happens, instead of waiting for real clock time.
//
//   cd api
//   node --import tsx scripts/seed-self-court-test.ts <scenario> <host> <user> [<user> ...]
//   node --import tsx scripts/seed-self-court-test.ts --clean
//
// Each <user> is a REAL account (sign-in email or Clerk id `user_...`); the
// first one hosts. 2–4 users. Scenarios:
//
//   open         an upcoming room (in 3h, court confirmed) hosted by the first
//                account with nobody else in it — sign in as another account,
//                browse Match Maker, see the address hidden, ask to join; the
//                host sees the requester's reliability badge.
//   live         a room that started 10 min ago (90 min long) with everyone in
//                it and nobody checked in yet — test GPS check-in (spoof your
//                position to the pin with DevTools → Sensors) and vouching.
//   ended        a match that ended 15 min ago; the host and the 2nd account
//                checked in by GPS, the rest didn't — test vouching for them in
//                the room chat's info dialog, then rating (attendees only).
//   settle       two matches that ended a day ago; the host and the 2nd
//                account attended both, the LAST account attended neither. The
//                next sweep (every 5 min) settles them: the last account gets 2
//                no-shows → reliability drops and joining is blocked for 7 days.
//                Needs 3+ accounts.
//   unconfirmed  two rooms whose court isn't confirmed: one starts in 4h (the
//                host gets a reminder on the next sweep), one in 1h50 (it is
//                cancelled on the next sweep, members are told).
//
//   --pin=<lat>,<lng>   where the court is (default: Nhà hát Thành phố, Q1).
//   --clean             delete everything this script created (rooms, chats,
//                       ratings, reliability records, notifications) and undo
//                       the Elo changes those matches caused.
//
// Reads DATABASE_URL and CLERK_SECRET_KEY from api/.env — it writes to the
// same database the server uses, so check the database name it prints. Every
// record is tagged `seed-self-` (rooms) / `room-seed-self-` (chats).

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
  EloChange,
  EloChangeSchema,
} from "../src/features/elo/elo-change.schema.js"
import {
  EloRating,
  EloRatingSchema,
} from "../src/features/elo/elo-rating.schema.js"
import { statusForRd } from "../src/features/elo/peer-update.js"
import {
  Notification,
  NotificationSchema,
} from "../src/features/notifications/notification.schema.js"
import { Rating, RatingSchema } from "../src/features/ratings/rating.schema.js"
import {
  ReliabilityEvent,
  ReliabilityEventSchema,
} from "../src/features/reliability/reliability-event.schema.js"
import {
  PlaySession,
  PlaySessionSchema,
} from "../src/features/sessions/session.schema.js"
import {
  initialsOf,
  type AttendanceMark,
  type PlaySession as PlaySessionData,
} from "../src/shared/index.js"

const SESSION_PREFIX = "seed-self-"
const CHANNEL_PREFIX = `room-${SESSION_PREFIX}`
/** Nhà hát Thành phố, Q1 — easy to type into DevTools → Sensors. */
const DEFAULT_PIN = { lat: 10.776889, lng: 106.703056 }

const SCENARIOS = ["open", "live", "ended", "settle", "unconfirmed"] as const
type Scenario = (typeof SCENARIOS)[number]

const MIN = 60_000
const HOUR = 60 * MIN

interface SeedUser {
  id: string
  name: string
}

function fail(message: string): never {
  console.error(`✖ ${message}`)
  process.exit(1)
}

const args = process.argv.slice(2)
const flags = args.filter((a) => a.startsWith("--"))
const positional = args.filter((a) => !a.startsWith("--"))
const pinFlag = flags.find((f) => f.startsWith("--pin="))
const unknownFlags = flags.filter((f) => f !== "--clean" && f !== pinFlag)
if (unknownFlags.length)
  fail(`Tham số không hợp lệ: ${unknownFlags.join(", ")}`)

const pin = pinFlag ? parsePin(pinFlag.slice("--pin=".length)) : DEFAULT_PIN

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
const reliability = mongoose.model(
  ReliabilityEvent.name,
  ReliabilityEventSchema
)
const eloRatings = mongoose.model(EloRating.name, EloRatingSchema)
const eloChanges = mongoose.model(EloChange.name, EloChangeSchema)

try {
  if (flags.includes("--clean")) await clean()
  else await seed()
} finally {
  await mongoose.disconnect()
}

function parsePin(raw: string): { lat: number; lng: number } {
  const [lat, lng] = raw.split(",").map(Number)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    fail(`--pin không hợp lệ: ${raw} (ví dụ --pin=10.7769,106.7009)`)
  }
  return { lat, lng }
}

async function clean(): Promise<void> {
  const sessionFilter = { sessionId: { $regex: `^${SESSION_PREFIX}` } }
  const channelFilter = { channelId: { $regex: `^${CHANNEL_PREFIX}` } }
  const removed = {
    eloReverted: await revertEloChanges(sessionFilter),
    eloHistory: (await eloChanges.deleteMany(sessionFilter)).deletedCount,
    // Every notification id the server builds for these rooms names the room.
    notifications: (
      await notifications.deleteMany({
        notifId: { $regex: SESSION_PREFIX },
      })
    ).deletedCount,
    reliability: (await reliability.deleteMany(sessionFilter)).deletedCount,
    ratings: (await ratings.deleteMany(sessionFilter)).deletedCount,
    rooms: (await sessions.deleteMany(sessionFilter)).deletedCount,
    messages: (await messages.deleteMany(channelFilter)).deletedCount,
    chatMembers: (await members.deleteMany(channelFilter)).deletedCount,
    chats: (await channels.deleteMany(channelFilter)).deletedCount,
  }
  console.log("✔ Đã xoá dữ liệu test phòng tự đặt sân:", removed)
}

/** Undo Elo changes the test matches caused (same rules as seed-rating-test). */
async function revertEloChanges(sessionFilter: object): Promise<number> {
  const changes = await eloChanges
    .find(sessionFilter)
    .sort({ createdAt: -1, _id: -1 })
    .lean()
  let reverted = 0
  for (const c of changes) {
    const key = { userId: c.userId, discipline: c.discipline }
    const res = await eloRatings.updateOne(
      { ...key, peerAppliedSessions: c.sessionId },
      {
        $inc: { currentElo: -c.delta, ratingUpdateCount: -1 },
        $pull: { peerAppliedSessions: c.sessionId },
      }
    )
    if (res.modifiedCount !== 1) continue
    reverted += 1
    await eloRatings.updateOne(
      { ...key, rd: c.rdAfter },
      { $set: { rd: c.rdBefore, status: statusForRd(c.rdBefore) } }
    )
    await eloRatings.updateOne(
      { ...key, ratingUpdateCount: 0 },
      { $unset: { lastPeerUpdateAt: 1 } }
    )
  }
  return reverted
}

async function seed(): Promise<void> {
  const [scenarioArg, ...userArgs] = positional
  if (!SCENARIOS.includes(scenarioArg as Scenario)) {
    fail(
      `Chọn kịch bản: ${SCENARIOS.join(" | ")}\n` +
        "  node --import tsx scripts/seed-self-court-test.ts live a@gmail.com b@gmail.com"
    )
  }
  const scenario = scenarioArg as Scenario
  if (userArgs.length < 2 || userArgs.length > 4) {
    fail("Cần 2–4 tài khoản (email hoặc Clerk id); tài khoản đầu là chủ phòng")
  }
  if (scenario === "settle" && userArgs.length < 3) {
    fail("Kịch bản settle cần ít nhất 3 tài khoản")
  }
  const users = await resolveUsers(userArgs)
  if (new Set(users.map((u) => u.id)).size !== users.length) {
    fail("Các tài khoản phải khác nhau")
  }
  const [host, second] = users
  const last = users[users.length - 1]
  const now = Date.now()
  const gps = (at: number): AttendanceMark => ({
    at: new Date(at).toISOString(),
    via: "gps",
  })

  console.log(`\n✔ Kịch bản "${scenario}" — vị trí sân: ${pin.lat}, ${pin.lng}`)
  switch (scenario) {
    case "open":
      await createRoom({
        title: "[TEST] Phòng mở · tự đặt sân",
        startMs: now + 3 * HOUR,
        players: [host],
        capacity: 4,
        confirmed: true,
      })
      console.log(
        `  → Đăng nhập bằng tài khoản KHÁC ${host.name} → Chơi → Ghép trận:\n` +
          "    thẻ phòng hiện “Tự đặt sân · Đã chốt sân”, mở chi tiết thấy địa chỉ\n" +
          "    bị ẩn → bấm Tham gia. Chủ phòng thấy điểm “Độ tin cậy” của người xin vào."
      )
      break
    case "live":
      await createRoom({
        title: "[TEST] Trận đang diễn ra · check-in",
        startMs: now - 10 * MIN,
        players: users,
        confirmed: true,
      })
      console.log(
        "  → Mỗi người: mở viên “Đang trong phòng” trên thanh trên → mục Điểm danh\n" +
          `    → “Check-in tại sân”. Giả lập vị trí: DevTools → ⋮ → More tools →\n` +
          `    Sensors → Location → ${pin.lat}, ${pin.lng}.\n` +
          "  → Sau khi check-in, mở nhóm chat của phòng → Thông tin nhóm →\n" +
          "    “Xác nhận có mặt” cho người chưa check-in."
      )
      break
    case "ended": {
      const startMs = now - 75 * MIN
      await createRoom({
        title: "[TEST] Trận vừa xong · điểm danh & đánh giá",
        startMs,
        durationMin: 60,
        players: users,
        confirmed: true,
        attendance: {
          [host.id]: gps(startMs + 5 * MIN),
          [second.id]: gps(startMs + 7 * MIN),
        },
      })
      console.log(
        `  → ${host.name} và ${second.name} đã check-in (GPS). Người còn lại chưa.\n` +
          "  → Trò chuyện → nhóm “[TEST] Trận vừa xong…” → Thông tin nhóm:\n" +
          "    người chưa điểm danh KHÔNG có nút “Đánh giá”; bấm “Xác nhận có mặt”\n" +
          "    cho họ, nút “Đánh giá” sẽ hiện. Trận “Tính Elo” có 2 GPS nên phiếu\n" +
          "    kỹ năng được tính (sau PEER_VOTE_WINDOW_MINUTES)."
      )
      break
    }
    case "settle": {
      const attendees = users.slice(0, -1)
      for (const [i, hoursAgo] of [26, 50].entries()) {
        const startMs = now - hoursAgo * HOUR
        await createRoom({
          title: `[TEST] Trận cũ #${i + 1} · chốt điểm danh`,
          startMs,
          durationMin: 60,
          players: users,
          confirmed: true,
          attendance: Object.fromEntries(
            attendees.map((u) => [u.id, gps(startMs + 5 * MIN)])
          ),
        })
      }
      console.log(
        "  → Chờ lần quét kế tiếp (mỗi 5 phút, api phải đang chạy). Sau đó:\n" +
          `    • ${last.name} nhận 2 thông báo “vắng mặt”; hồ sơ hiện Độ tin cậy\n` +
          "      thấp và “Tạm khoá tham gia phòng đến …”.\n" +
          `    • ${last.name} thử xin vào một phòng (vd. kịch bản open) → bị từ chối.\n` +
          "    • Những người còn lại được ghi “có mặt”."
      )
      break
    }
    case "unconfirmed":
      await createRoom({
        title: "[TEST] Chưa chốt sân · sắp bị huỷ",
        startMs: now + 110 * MIN,
        players: users,
        confirmed: false,
      })
      await createRoom({
        title: "[TEST] Chưa chốt sân · sẽ được nhắc",
        startMs: now + 4 * HOUR,
        players: users,
        confirmed: false,
      })
      console.log(
        "  → Trong ≤5 phút (lần quét kế tiếp):\n" +
          "    • phòng “sắp bị huỷ” chuyển sang đã huỷ, mọi người nhận thông báo,\n" +
          `      ${host.name} bị tính 1 lần huỷ muộn;\n` +
          `    • ${host.name} nhận nhắc chốt sân cho phòng “sẽ được nhắc”.\n` +
          "  → Thử: chủ phòng mở phòng “sẽ được nhắc” → bấm “Đã chốt sân”."
      )
      break
  }
  console.log(
    "\nDọn dữ liệu: node --import tsx scripts/seed-self-court-test.ts --clean"
  )

  async function createRoom(input: {
    title: string
    startMs: number
    durationMin?: number
    players: SeedUser[]
    capacity?: number
    confirmed: boolean
    attendance?: Record<string, AttendanceMark>
  }): Promise<void> {
    const durationMin = input.durationMin ?? 90
    const sessionId = `${SESSION_PREFIX}${randomUUID().replaceAll("-", "").slice(0, 12)}`
    const channelId = `room-${sessionId}`
    // Wall time in Asia/Ho_Chi_Minh, minute precision.
    const local = new Date(input.startMs + 7 * HOUR).toISOString()
    const dayKey = local.slice(0, 10)
    const slot = local.slice(11, 16)
    const startAt = `${dayKey}T${slot}:00+07:00`
    const endAt = new Date(
      Date.parse(startAt) + durationMin * MIN
    ).toISOString()
    const [owner, ...others] = input.players

    const data: PlaySessionData = {
      id: sessionId,
      title: input.title,
      sport: "badminton",
      format: "Doubles",
      courtId: null,
      dayKey,
      dayLabel: dayKey,
      slot,
      durationMin,
      startAt,
      endAt,
      courtLabel: null,
      host: { name: owner.name, initials: initialsOf(owner.name) },
      capacity: Math.max(input.capacity ?? 0, input.players.length, 2),
      roster: [
        { name: owner.name, initials: initialsOf(owner.name), rsvp: "host" },
        ...others.map((u) => ({
          name: u.name,
          initials: initialsOf(u.name),
          rsvp: "going" as const,
          userId: u.id,
        })),
      ],
      level: "any",
      status: "forming",
      listed: true,
      fillIntent: "find",
      venue: "Sân test Nhà hát",
      ward: "Quận 1",
      distanceKm: null,
      pricePerHour: 0,
      courtMode: "self",
      selfCourt: {
        name: "Sân test Nhà hát",
        address: "7 Công Trường Lam Sơn, Bến Nghé, Quận 1",
        lat: pin.lat,
        lng: pin.lng,
        courtNote: "Sân số 2",
        costPerPerson: 60000,
        confirmed: input.confirmed,
        ...(input.confirmed
          ? { confirmedAt: new Date(now).toISOString() }
          : {}),
      },
      ranked: true,
      ...(input.attendance ? { attendance: input.attendance } : {}),
    }

    const at = new Date(now)
    await channels.create({
      channelId,
      kind: "room",
      name: input.title,
      createdBy: owner.id,
      frozen: false,
      lastMessageAt: at,
      lastMessage: {
        senderId: owner.id,
        text: "Phòng test tự đặt sân",
        hasImage: false,
      },
    })
    await members.insertMany(
      input.players.map((u) => ({ channelId, userId: u.id, lastReadAt: at }))
    )
    await messages.create({
      channelId,
      senderId: owner.id,
      text: "Phòng test tự đặt sân",
    })
    await sessions.create({ userId: owner.id, sessionId, data })
    console.log(`  • ${input.title}  (${sessionId}, ${dayKey} ${slot})`)
  }
}

/** Look each argument up in Clerk — by email when it has an "@", else by id. */
async function resolveUsers(list: string[]): Promise<SeedUser[]> {
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) fail("CLERK_SECRET_KEY chưa được đặt (api/.env)")
  const clerk = createClerkClient({ secretKey })
  const found: SeedUser[] = []
  for (const arg of list) {
    const user = arg.includes("@")
      ? (await clerk.users.getUserList({ emailAddress: [arg], limit: 1 }))
          .data[0]
      : await clerk.users.getUser(arg).catch(() => undefined)
    if (!user) fail(`Không tìm thấy tài khoản Clerk: ${arg}`)
    const email = user.primaryEmailAddress?.emailAddress ?? ""
    const name =
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
      user.username ||
      email ||
      user.id
    found.push({ id: user.id, name })
  }
  return found
}
