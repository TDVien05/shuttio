import assert from "node:assert/strict"
import { after, test } from "node:test"

import "reflect-metadata"

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { getConnectionToken, MongooseModule } from "@nestjs/mongoose"
import { Test } from "@nestjs/testing"
import type { Connection } from "mongoose"

import {
  Booking,
  BookingSchema,
} from "../src/features/bookings/booking.schema.js"
import { Brand, BrandSchema } from "../src/features/brands/brand.schema.js"
import { ChatEventsService } from "../src/features/chat/chat-events.service.js"
import { ChatImagesService } from "../src/features/chat/chat-images.service.js"
import { ChatMessagesService } from "../src/features/chat/chat-messages.service.js"
import {
  channelKindFromId,
  dmChannelId,
  isGroupChannel,
  MAX_GROUP_MEMBERS,
  roomChannelId,
  venueChannelId,
} from "../src/features/chat/chat.ids.js"
import {
  ChatChannel,
  ChatChannelSchema,
  ChatMember,
  ChatMemberSchema,
  ChatMessage,
  ChatMessageSchema,
} from "../src/features/chat/chat.schema.js"
import { ChatService } from "../src/features/chat/chat.service.js"
import { ClerkDirectoryService } from "../src/features/directory/clerk-directory.service.js"
import { Venue, VenueSchema } from "../src/features/venues/venue.schema.js"

// ── Pure helpers (always run) ───────────────────────────────────────────────

void test("channel ids imply their kind", () => {
  assert.equal(channelKindFromId(roomChannelId("s1")), "room")
  assert.equal(channelKindFromId(venueChannelId("v1", "u1")), "venue")
  assert.equal(channelKindFromId("group-abc"), "group")
  assert.equal(channelKindFromId(dmChannelId("a", "b")), "dm")
})

void test("dmChannelId is order-independent", () => {
  assert.equal(dmChannelId("a", "b"), dmChannelId("b", "a"))
  assert.notEqual(dmChannelId("a", "b"), dmChannelId("a", "c"))
})

void test("isGroupChannel: groups and rooms yes; DMs and venue chats no", () => {
  const m = (n: number, isVenueChat = false) => ({
    memberIds: Array.from({ length: n }, (_, i) => `u${i}`),
    isVenueChat,
  })
  assert.equal(isGroupChannel("group-x", m(2)), true)
  assert.equal(isGroupChannel("room-x", m(1)), true)
  assert.equal(isGroupChannel(dmChannelId("a", "b"), m(2)), false)
  assert.equal(isGroupChannel("venue-x", m(2, true)), false)
  assert.equal(isGroupChannel("other", m(3)), true)
})

// ── Service behaviour against a real MongoDB ────────────────────────────────
// Skipped unless CHAT_TEST_MONGO_URL points at a MongoDB (e.g. `docker compose
// --profile localdb up -d mongo` → mongodb://localhost:27017). Each run uses its
// own throwaway database.

const MONGO_URL = process.env.CHAT_TEST_MONGO_URL
const skip = MONGO_URL ? false : "set CHAT_TEST_MONGO_URL to run"

interface Harness {
  chat: ChatService
  messages: ChatMessagesService
  connection: Connection
  published: { userIds: string[]; what: string; channelId: string }[]
  close: () => Promise<void>
}

const directoryUsers = new Map<string, { id: string; name: string }>()
const knownUser = (id: string) => {
  directoryUsers.set(id, { id, name: `Name ${id}` })
  return id
}

let harness: Promise<Harness> | undefined
function getHarness(): Promise<Harness> {
  return (harness ??= (async () => {
    const dbName = `chat_test_${Date.now()}`
    const published: Harness["published"] = []
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(MONGO_URL!, { dbName }),
        MongooseModule.forFeature([
          { name: ChatChannel.name, schema: ChatChannelSchema },
          { name: ChatMember.name, schema: ChatMemberSchema },
          { name: ChatMessage.name, schema: ChatMessageSchema },
          { name: Venue.name, schema: VenueSchema },
          { name: Booking.name, schema: BookingSchema },
          { name: Brand.name, schema: BrandSchema },
        ]),
      ],
      providers: [
        ChatService,
        ChatMessagesService,
        ChatImagesService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              ({
                CLOUDINARY_CLOUD_NAME: "demo",
                CLOUDINARY_API_KEY: "key",
                CLOUDINARY_API_SECRET: "secret",
              })[key],
          },
        },
        {
          provide: ChatEventsService,
          useValue: {
            message: (userIds: string[], m: { channelId: string }) =>
              published.push({
                userIds,
                what: "message",
                channelId: m.channelId,
              }),
            channelChanged: (userIds: string[], channelId: string) =>
              published.push({ userIds, what: "channel", channelId }),
          },
        },
        {
          provide: ClerkDirectoryService,
          useValue: {
            getMany: (ids: string[]) =>
              Promise.resolve(
                ids.flatMap((id) => directoryUsers.get(id) ?? [])
              ),
            findExisting: (id: string) =>
              Promise.resolve(directoryUsers.get(id) ?? null),
          },
        },
      ],
    }).compile()
    const connection = moduleRef.get<Connection>(getConnectionToken())
    return {
      chat: moduleRef.get(ChatService),
      messages: moduleRef.get(ChatMessagesService),
      connection,
      published,
      close: async () => {
        await connection.dropDatabase()
        await moduleRef.close()
      },
    }
  })())
}

after(async () => {
  if (harness) await (await harness).close()
})

let seq = 0
/** Fresh, known user ids so tests never share conversations. */
const users = (n: number) =>
  Array.from({ length: n }, () => knownUser(`u${Date.now()}_${seq++}`))

void test(
  "DM: opening it twice lands in the same conversation, for both people",
  { skip },
  async () => {
    const { chat } = await getHarness()
    const [a, b] = users(2)
    const first = await chat.createConversation(a, { memberIds: [b] })
    const again = await chat.createConversation(b, { memberIds: [a] })
    assert.equal(first.id, again.id)
    const list = await chat.listChannels(a)
    assert.equal(list.length, 1)
    assert.equal(list[0].kind, "dm")
    assert.deepEqual(list[0].members.map((m) => m.id).sort(), [a, b].sort())
    assert.equal(list[0].name, null)
  }
)

void test(
  "conversations need real users, a name for groups, and a size cap",
  { skip },
  async () => {
    const { chat } = await getHarness()
    const [a, b, c] = users(3)
    await assert.rejects(
      chat.createConversation(a, { memberIds: [] }),
      BadRequestException
    )
    await assert.rejects(
      chat.createConversation(a, { memberIds: ["ghost"] }),
      NotFoundException
    )
    await assert.rejects(
      chat.createConversation(a, { memberIds: [b, c] }),
      BadRequestException
    )
    const many = users(MAX_GROUP_MEMBERS)
    await assert.rejects(
      chat.createConversation(a, { memberIds: many, name: "Quá đông" }),
      BadRequestException
    )
  }
)

void test(
  "groups: any member renames; non-members, DMs and blank names are refused",
  { skip },
  async () => {
    const { chat } = await getHarness()
    const [a, b, c, stranger] = users(4)
    const { id } = await chat.createConversation(a, {
      memberIds: [b, c],
      name: "Nhóm",
    })
    await chat.renameGroup(b, id, "  Tên mới  ")
    const [row] = await chat.listChannels(a)
    assert.equal(row.name, "Tên mới")
    await assert.rejects(
      chat.renameGroup(stranger, id, "x"),
      ForbiddenException
    )
    await assert.rejects(chat.renameGroup(a, id, "   "), BadRequestException)
    const dm = await chat.createConversation(a, { memberIds: [stranger] })
    await assert.rejects(chat.renameGroup(a, dm.id, "x"), BadRequestException)
  }
)

void test(
  "groups: only the creator adds members, up to the cap, real users only",
  { skip },
  async () => {
    const { chat } = await getHarness()
    const [owner, b, c, d] = users(4)
    const { id } = await chat.createConversation(owner, {
      memberIds: [b, c],
      name: "G",
    })
    await assert.rejects(chat.addGroupMembers(b, id, [d]), ForbiddenException)
    await assert.rejects(
      chat.addGroupMembers(owner, id, ["ghost"]),
      NotFoundException
    )
    await assert.rejects(
      chat.addGroupMembers(owner, id, users(MAX_GROUP_MEMBERS)),
      BadRequestException
    )
    await chat.addGroupMembers(owner, id, [b, d]) // b already in — skipped
    assert.equal((await chat.channelMembership(id)).memberIds.length, 4)
    await assert.rejects(
      chat.addGroupMembers(owner, roomChannelId("x"), [d]),
      BadRequestException
    )
  }
)

void test(
  "leaving: a group drops you out; a DM is deleted for you only",
  { skip },
  async () => {
    const { chat, messages } = await getHarness()
    const [a, b, c] = users(3)
    const group = await chat.createConversation(a, {
      memberIds: [b, c],
      name: "G",
    })
    await chat.leaveConversation(b, group.id)
    assert.deepEqual(
      (await chat.channelMembership(group.id)).memberIds.sort(),
      [a, c].sort()
    )
    assert.equal((await chat.listChannels(b)).length, 0)

    const dm = await chat.createConversation(a, { memberIds: [b] })
    await messages.send(a, dm.id, { text: "xin chào" })
    await chat.leaveConversation(b, dm.id)
    assert.equal((await chat.listChannels(b)).length, 0)
    assert.equal((await chat.listChannels(a)).length, 2) // group + dm
    // The other side's history is untouched; the leaver's was cleared.
    assert.equal((await messages.list(a, dm.id, {})).messages.length, 1)
    assert.equal((await messages.list(b, dm.id, {})).messages.length, 0)
    // A new message brings the thread back, with only what's new.
    await messages.send(a, dm.id, { text: "còn đó không" })
    const back = (await chat.listChannels(b)).find((r) => r.id === dm.id)
    assert.ok(back)
    assert.equal(back.unread, 1)
    const hist = await messages.list(b, dm.id, {})
    assert.deepEqual(
      hist.messages.map((m) => m.text),
      ["còn đó không"]
    )
  }
)

void test(
  "deleteGroup: creator or last member; rooms only when last",
  { skip },
  async () => {
    const { chat } = await getHarness()
    const [owner, b, c] = users(3)
    const { id } = await chat.createConversation(owner, {
      memberIds: [b, c],
      name: "G",
    })
    await assert.rejects(chat.deleteGroup(b, id), ForbiddenException)
    await chat.deleteGroup(owner, id)
    assert.equal((await chat.listChannels(b)).length, 0)
    await assert.rejects(chat.channelMembership(id), NotFoundException)

    const room = roomChannelId(`s${seq++}`)
    await chat.createRoomChannel(owner, { id: room, name: "Phòng" })
    await chat.addRoomMember(owner, room, b)
    await assert.rejects(chat.deleteGroup(owner, room), ForbiddenException)
    await chat.removeRoomMember(b, room, b)
    await chat.deleteGroup(owner, room)
    await assert.rejects(chat.deleteGroup(owner, "dm-xyz"), BadRequestException)
  }
)

void test(
  "rooms: host-only creation guard, add, kick; members may leave; freeze blocks sends",
  { skip },
  async () => {
    const { chat, messages } = await getHarness()
    const [host, member, other] = users(3)
    const room = roomChannelId(`s${seq++}`)
    await assert.rejects(
      chat.createRoomChannel(host, { id: "venue-nope", name: "x" }),
      BadRequestException
    )
    await chat.createRoomChannel(host, { id: room, name: "Phòng" })
    await chat.createRoomChannel(host, { id: room, name: "Phòng" }) // idempotent
    await assert.rejects(
      chat.createRoomChannel(other, { id: room, name: "Cướp" }),
      ForbiddenException
    )
    await assert.rejects(
      chat.addRoomMember(other, room, member),
      ForbiddenException
    )
    await chat.addRoomMember(host, room, member)
    await assert.rejects(
      chat.removeRoomMember(other, room, member),
      ForbiddenException
    )

    await messages.send(member, room, { text: "hi" })
    await chat.freezeRoomChannel(host, room)
    await assert.rejects(
      messages.send(member, room, { text: "again" }),
      ForbiddenException
    )
    assert.equal((await messages.list(member, room, {})).messages.length, 1) // history kept
    assert.equal((await chat.listChannels(member))[0].frozen, true)
    await assert.rejects(
      chat.freezeChannelById("room-missing"),
      NotFoundException
    )

    await chat.removeRoomMember(member, room, member) // self-leave
    assert.equal((await chat.listChannels(member)).length, 0)
    await chat.removeRoomMember(host, room, host)
  }
)

void test(
  "messages: order, paging, unread counts and read state",
  { skip },
  async () => {
    const { chat, messages } = await getHarness()
    const [a, b] = users(2)
    const { id } = await chat.createConversation(a, { memberIds: [b] })
    for (let i = 1; i <= 5; i++) await messages.send(a, id, { text: `m${i}` })

    const latest = await messages.list(b, id, { limit: 2 })
    assert.deepEqual(
      latest.messages.map((m) => m.text),
      ["m4", "m5"]
    )
    assert.equal(latest.hasMore, true)
    const older = await messages.list(b, id, {
      limit: 10,
      before: latest.messages[0].id,
    })
    assert.deepEqual(
      older.messages.map((m) => m.text),
      ["m1", "m2", "m3"]
    )
    assert.equal(older.hasMore, false)

    const row = (await chat.listChannels(b))[0]
    assert.equal(row.unread, 5)
    assert.equal(row.lastMessage?.text, "m5")
    assert.equal((await chat.listChannels(a))[0].unread, 0) // own messages
    await messages.markRead(b, id)
    assert.equal((await chat.listChannels(b))[0].unread, 0)
  }
)

void test(
  "messages: empty is refused, non-members are kept out, events reach every member",
  { skip },
  async () => {
    const { chat, messages, published } = await getHarness()
    const [a, b, stranger] = users(3)
    const { id } = await chat.createConversation(a, { memberIds: [b] })
    await assert.rejects(
      messages.send(a, id, { text: "   " }),
      BadRequestException
    )
    await assert.rejects(
      messages.send(stranger, id, { text: "hi" }),
      ForbiddenException
    )
    await assert.rejects(messages.list(stranger, id, {}), ForbiddenException)
    await assert.rejects(
      messages.send(a, "dm-missing", { text: "x" }),
      NotFoundException
    )
    await messages.send(a, id, { text: "hello" })
    const evt = published.findLast(
      (p) => p.what === "message" && p.channelId === id
    )
    assert.deepEqual([...(evt?.userIds ?? [])].sort(), [a, b].sort())
  }
)

void test(
  "pictures: only uploads from this conversation's folder, delivered as signed private URLs",
  { skip },
  async () => {
    const { chat, messages } = await getHarness()
    const [a, b] = users(2)
    const { id } = await chat.createConversation(a, { memberIds: [b] })

    const sig = await messages.signImageUpload(a, id)
    assert.equal(sig.type, "authenticated")
    assert.equal(sig.folder, `shuttio/chat/${id}`)
    await assert.rejects(
      messages.signImageUpload("stranger", id),
      ForbiddenException
    )

    const ref = {
      publicId: `${sig.folder}/abc123`,
      version: 1700000000,
      format: "jpg",
      width: 800,
      height: 600,
    }
    await assert.rejects(
      messages.send(a, id, {
        image: { ...ref, publicId: "shuttio/chat/other-chat/abc123" },
      }),
      BadRequestException
    )
    await assert.rejects(
      messages.send(a, id, {
        image: { ...ref, publicId: `${sig.folder}/../x` },
      }),
      BadRequestException
    )
    await assert.rejects(
      messages.send(a, id, { image: { ...ref, format: "svg" } }),
      BadRequestException
    )

    const sent = await messages.send(a, id, { image: ref })
    assert.ok(sent.image)
    assert.match(
      sent.image.url,
      /^https:\/\/res\.cloudinary\.com\/demo\/image\/authenticated\/s--[\w-]{8}--\//
    )
    assert.match(sent.image.thumbUrl, /w_480/)
    assert.equal(sent.image.width, 800)
    assert.equal((await chat.listChannels(b))[0].lastMessage?.hasImage, true)
  }
)

void test(
  "venue chats: one thread per pair/brand, operator inbox filter, booking gate",
  { skip },
  async () => {
    const { chat, messages, connection } = await getHarness()
    const [player, owner, otherPlayer] = users(3)
    const venueId = `v${seq++}`
    const venue2 = `v${seq++}`
    const brandId = `b${seq++}`
    await connection.collection("venues").insertMany([
      { venueId, ownerId: owner, brandId, info: { name: "Sân A" } },
      { venueId: venue2, ownerId: owner, brandId, info: { name: "Sân B" } },
    ])
    await connection
      .collection("brands")
      .insertOne({ brandId, ownerId: owner, info: { name: "Thương hiệu" } })

    await assert.rejects(
      chat.openVenueChat(player, { venueId }),
      ForbiddenException
    ) // no booking yet
    await connection.collection("bookings").insertOne({
      bookingId: `bk${seq++}`,
      userId: player,
      venueId,
      paymentStatus: "paid",
    })
    await assert.rejects(
      chat.openVenueChat(owner, { venueId }),
      BadRequestException
    )
    await assert.rejects(
      chat.openVenueChat(player, { venueId: "nope" }),
      NotFoundException
    )

    const first = await chat.openVenueChat(player, { venueId })
    const second = await chat.openVenueChat(player, { venueId })
    assert.equal(first.id, second.id)
    // Another branch of the same brand reuses the one brand thread.
    const viaBranch = await chat.ensureBookingChannel({
      playerId: player,
      ownerId: owner,
      venueId: venue2,
      brandId,
      name: "Sân B",
    })
    assert.equal(viaBranch, first.id)
    const [row] = await chat.listChannels(player)
    assert.equal(row.kind, "venue")
    assert.equal(row.name, "Thương hiệu")

    await messages.sendSystem(
      first.id,
      player,
      "[Hệ thống] ok",
      "https://res.cloudinary.com/demo/image/upload/x.png"
    )
    const operator = await chat.listChannels(owner, venue2)
    assert.equal(operator.length, 1) // found through the brand even though created via venue A
    const sent = (await messages.list(owner, first.id, {})).messages[0]
    assert.equal(sent.system, true)
    assert.equal(
      sent.image?.url,
      "https://res.cloudinary.com/demo/image/upload/x.png"
    )

    // The player deleting it for themselves doesn't remove it for the operator.
    await chat.leaveConversation(player, first.id)
    assert.equal((await chat.listChannels(owner, venueId)).length, 1)
    assert.equal((await chat.listChannels(otherPlayer, venueId)).length, 0)
  }
)
