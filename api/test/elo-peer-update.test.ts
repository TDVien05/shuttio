import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { ConfigService } from "@nestjs/config"
import { getModelToken } from "@nestjs/mongoose"
import { Test } from "@nestjs/testing"

import { EloChange } from "../src/features/elo/elo-change.schema.js"
import { EloRating } from "../src/features/elo/elo-rating.schema.js"
import { EloService } from "../src/features/elo/elo.service.js"
import {
  PEER_MAX_DELTA,
  RD_FLOOR,
  computePeerUpdate,
  inflateRd,
  initialRd,
  minVotersFor,
  raterWeight,
  statusForRd,
  type SkillVote,
} from "../src/features/elo/peer-update.js"
import { NotificationsService } from "../src/features/notifications/notifications.service.js"
import {
  PEER_VOTE_WINDOW_MS,
  PeerEloService,
} from "../src/features/ratings/peer-elo.service.js"
import { Rating } from "../src/features/ratings/rating.schema.js"
import { PlaySession } from "../src/features/sessions/session.schema.js"

/**
 * Elo từ đánh giá chéo ẩn danh: công thức Bayes có độ bất định (rd), áp nguyên
 * tử một lần cho mỗi trận, và sweep gom phiếu theo (trận, người được chấm) sau
 * khi cửa sổ thu phiếu đóng.
 */

const votes = (...vs: SkillVote[]) => vs.map((vote) => ({ vote, weight: 1 }))

// ── Công thức ──────────────────────────────────────────────────────────

void test("chưa đủ 2 người chấm → không cập nhật", () => {
  assert.equal(computePeerUpdate({ elo: 1000, rd: 150, votes: [] }), null)
  assert.equal(computePeerUpdate({ elo: 1000, rd: 150, votes: votes(1) }), null)
})

void test("3 phiếu 'mạnh hơn' với rd 150 → +43, rd thu hẹp", () => {
  const r = computePeerUpdate({ elo: 1004, rd: 150, votes: votes(1, 1, 1) })
  assert.ok(r)
  // g = 150² / (150² + 300²/3) = 3/7; delta = round(3/7 × 100) = 43.
  assert.equal(r.delta, 43)
  assert.equal(r.elo, 1047)
  assert.ok(Math.abs(r.gain - 3 / 7) < 1e-9)
  assert.ok(Math.abs(r.rd - 150 * Math.sqrt(4 / 7)) < 1e-9)
})

void test("phiếu trái chiều triệt tiêu: Elo giữ nguyên nhưng rd vẫn giảm", () => {
  const r = computePeerUpdate({ elo: 1000, rd: 150, votes: votes(1, -1) })
  assert.ok(r)
  assert.equal(r.delta, 0)
  assert.equal(r.elo, 1000)
  assert.ok(r.rd < 150)

  const same = computePeerUpdate({ elo: 1000, rd: 150, votes: votes(0, 0, 0) })
  assert.equal(same?.delta, 0)
})

void test("đối xứng, có trần ±50 và rd không dưới sàn", () => {
  const up = computePeerUpdate({ elo: 1000, rd: 150, votes: votes(1, 1) })
  const down = computePeerUpdate({ elo: 1000, rd: 150, votes: votes(-1, -1) })
  assert.equal(up?.delta, -(down?.delta ?? 0))

  const big = computePeerUpdate({
    elo: 1000,
    rd: 250,
    votes: votes(1, 1, 1, 1, 1),
  })
  assert.equal(big?.delta, PEER_MAX_DELTA)

  const floor = computePeerUpdate({
    elo: 1000,
    rd: RD_FLOOR,
    votes: votes(1, 1, 1, 1, 1, 1, 1, 1),
  })
  assert.equal(floor?.rd, RD_FLOOR)
})

void test("rd nhỏ (đã ổn định) đổi điểm ít hơn rd lớn với cùng phiếu", () => {
  const fresh = computePeerUpdate({ elo: 1000, rd: 150, votes: votes(1, 1, 1) })
  const settled = computePeerUpdate({
    elo: 1000,
    rd: 60,
    votes: votes(1, 1, 1),
  })
  assert.ok(fresh && settled)
  assert.ok(settled.delta < fresh.delta)
  assert.ok(settled.delta > 0)
})

void test("trọng số người chấm giảm khi chấm lặp lại cùng một người", () => {
  assert.equal(raterWeight(0), 1)
  assert.equal(raterWeight(1), 0.5)
  assert.equal(raterWeight(3), 0.25)
  assert.equal(raterWeight(50), 0.25)

  const firstTime = computePeerUpdate({
    elo: 1000,
    rd: 150,
    votes: votes(1, 1),
  })
  const repeated = computePeerUpdate({
    elo: 1000,
    rd: 150,
    votes: [
      { vote: 1, weight: raterWeight(3) },
      { vote: 1, weight: raterWeight(3) },
    ],
  })
  assert.ok(firstTime && repeated)
  assert.ok(repeated.delta < firstTime.delta)
})

void test("rd nở lại theo thời gian, không vượt rd khởi tạo, không tự giảm", () => {
  assert.equal(inflateRd(50, 0, 150), 50)
  assert.ok(Math.abs(inflateRd(50, 90, 150) - Math.sqrt(11500)) < 1e-9)
  assert.equal(inflateRd(140, 1000, 150), 150)
  assert.equal(inflateRd(250, 10, 150), 250)
  assert.equal(initialRd("ASSESSMENT"), 150)
  assert.equal(initialRd("DEFAULT"), 250)
  assert.equal(statusForRd(90), "ESTABLISHED")
  assert.equal(statusForRd(90.01), "PROVISIONAL")
})

// ── EloService.applyPeerVotes ──────────────────────────────────────────

type Doc = Record<string, unknown>

/** Giả lập `elo_ratings` đủ cho applyPeerVotes: findOne + updateOne có điều kiện. */
function makeEloModel(seed: Doc[], opts: { loseRaces?: number } = {}) {
  const docs = seed.map((d) => ({ ...d }))
  let racesToLose = opts.loseRaces ?? 0
  return {
    docs,
    findOne: (f: Doc) => ({
      // Trả bản sao như `.lean()` thật: cập nhật sau đó không sửa bản đã đọc.
      lean: () => {
        const found = docs.find(
          (d) => d.userId === f.userId && d.discipline === f.discipline
        )
        return Promise.resolve(found ? { ...found } : null)
      },
    }),
    updateOne: (
      f: Doc & { peerAppliedSessions: { $ne: string } },
      u: {
        $set: Doc
        $inc: { ratingUpdateCount: number }
        $push: { peerAppliedSessions: { $each: string[]; $slice: number } }
      }
    ) => {
      const d = docs.find(
        (x) => x.userId === f.userId && x.discipline === f.discipline
      )
      const applied = (d?.peerAppliedSessions as string[] | undefined) ?? []
      if (racesToLose > 0) {
        // Một cập nhật khác chen vào giữa lúc đọc và lúc ghi.
        racesToLose -= 1
        if (d) d.ratingUpdateCount = (d.ratingUpdateCount as number) + 1
        return Promise.resolve({ modifiedCount: 0 })
      }
      if (
        !d ||
        d.ratingUpdateCount !== f.ratingUpdateCount ||
        applied.includes(f.peerAppliedSessions.$ne)
      ) {
        return Promise.resolve({ modifiedCount: 0 })
      }
      Object.assign(d, u.$set)
      d.ratingUpdateCount =
        (d.ratingUpdateCount as number) + u.$inc.ratingUpdateCount
      d.peerAppliedSessions = [
        ...applied,
        ...u.$push.peerAppliedSessions.$each,
      ].slice(u.$push.peerAppliedSessions.$slice)
      return Promise.resolve({ modifiedCount: 1 })
    },
  }
}

const rating = (overrides: Doc = {}): Doc => ({
  userId: "u1",
  discipline: "DOUBLES",
  currentElo: 1004,
  initialElo: 1004,
  status: "PROVISIONAL",
  source: "ASSESSMENT",
  ratingUpdateCount: 0,
  initializedAt: new Date("2026-01-01T00:00:00Z"),
  ...overrides,
})

async function makeEloService(seed: Doc[], opts: { loseRaces?: number } = {}) {
  const model = makeEloModel(seed, opts)
  const history: Doc[] = []
  const moduleRef = await Test.createTestingModule({
    providers: [
      EloService,
      { provide: getModelToken(EloRating.name), useValue: model },
      {
        provide: getModelToken(EloChange.name),
        useValue: {
          create: (doc: Doc) => {
            // Mỗi bản ghi cách nhau một phút để thứ tự thời gian xác định.
            const createdAt = new Date(NOW.getTime() + history.length * 60_000)
            history.push({ ...doc, createdAt })
            return Promise.resolve(doc)
          },
          // find().sort().limit().select().lean() của getHistory: mới nhất trước.
          find: (f: Doc) => ({
            sort: () => ({
              limit: (n: number) => ({
                select: () => ({
                  lean: () =>
                    Promise.resolve(
                      history
                        .filter((h) => h.userId === f.userId)
                        .slice()
                        .reverse()
                        .slice(0, n)
                    ),
                }),
              }),
            }),
          }),
        },
      },
    ],
  }).compile()
  return { service: moduleRef.get(EloService), model, history }
}

const NOW = new Date("2026-11-14T10:00:00Z")

void test("applyPeerVotes cập nhật Elo, rd, bộ đếm và ghi lịch sử", async () => {
  const { service, model, history } = await makeEloService([rating()])
  const res = await service.applyPeerVotes("u1", "s-1", votes(1, 1, 1), NOW)
  assert.deepEqual(res, {
    outcome: "applied",
    eloBefore: 1004,
    eloAfter: 1047,
    delta: 43,
    status: "PROVISIONAL",
  })
  const doc = model.docs[0]
  assert.equal(doc.currentElo, 1047)
  assert.equal(doc.initialElo, 1004)
  assert.equal(doc.ratingUpdateCount, 1)
  assert.equal(doc.rd, 113.39)
  assert.deepEqual(doc.peerAppliedSessions, ["s-1"])
  assert.equal(doc.lastPeerUpdateAt, NOW)

  assert.equal(history.length, 1)
  assert.equal(history[0].delta, 43)
  assert.equal(history[0].voters, 3)
  assert.equal(history[0].reason, "PEER_RATING")
  // Ẩn danh: lịch sử không lưu ai đã chấm.
  assert.equal("raterId" in history[0], false)

  // Kết quả công khai phản ánh điểm mới và hết quyền làm lại bảng hỏi.
  const result = await service.getResult("u1")
  assert.equal(result.elo, 1047)
  assert.equal(result.canTakeAssessment, false)
  assert.ok(result.notice?.includes("đánh giá ẩn danh"))
})

void test("một trận chỉ được tính một lần (sweep chạy lại không cộng trùng)", async () => {
  const { service, model, history } = await makeEloService([rating()])
  await service.applyPeerVotes("u1", "s-1", votes(1, 1, 1), NOW)
  const again = await service.applyPeerVotes("u1", "s-1", votes(1, 1, 1), NOW)
  assert.deepEqual(again, { outcome: "skipped" })
  assert.equal(model.docs[0].currentElo, 1047)
  assert.equal(model.docs[0].ratingUpdateCount, 1)
  assert.equal(history.length, 1)
})

void test("bỏ qua khi chưa có rating hoặc chưa đủ người chấm", async () => {
  const { service, model } = await makeEloService([rating()])
  assert.deepEqual(await service.applyPeerVotes("ghost", "s-1", votes(1, 1)), {
    outcome: "skipped",
  })
  assert.deepEqual(await service.applyPeerVotes("u1", "s-1", votes(1)), {
    outcome: "skipped",
  })
  assert.equal(model.docs[0].ratingUpdateCount, 0)
})

void test("thua cuộc đua thì đọc lại và thử lại; thua mãi thì trả retry", async () => {
  const once = await makeEloService([rating()], { loseRaces: 1 })
  const ok = await once.service.applyPeerVotes("u1", "s-1", votes(1, 1, 1), NOW)
  assert.equal(ok.outcome, "applied")
  assert.equal(once.model.docs[0].currentElo, 1047)

  const always = await makeEloService([rating()], { loseRaces: 99 })
  assert.deepEqual(
    await always.service.applyPeerVotes("u1", "s-1", votes(1, 1, 1), NOW),
    { outcome: "retry" }
  )
  assert.equal(always.model.docs[0].currentElo, 1004)
})

void test("rating mặc định (rd 250) đổi nhanh hơn; đủ phiếu thì thành ESTABLISHED", async () => {
  const { service, model } = await makeEloService([
    rating({ source: "DEFAULT", currentElo: 1000, initialElo: 1000 }),
  ])
  const first = await service.applyPeerVotes("u1", "s-1", votes(1, 1, 1), NOW)
  assert.equal(first.outcome === "applied" && first.delta, 50)

  let status = ""
  for (let i = 2; i <= 8; i++) {
    const r = await service.applyPeerVotes("u1", `s-${i}`, votes(0, 0, 0), NOW)
    if (r.outcome === "applied") status = r.status
  }
  assert.equal(status, "ESTABLISHED")
  assert.equal(model.docs[0].status, "ESTABLISHED")
  assert.equal((await service.getPlayerElo("u1"))?.status, "ESTABLISHED")
})

void test("getHistory trả các lần thay đổi mới nhất trước, không lộ trận hay người chấm", async () => {
  const { service } = await makeEloService([rating()])
  assert.deepEqual(await service.getHistory("ghost"), {
    initialElo: null,
    currentElo: null,
    initializedAt: null,
    changes: [],
  })
  assert.deepEqual((await service.getHistory("u1")).changes, [])

  await service.applyPeerVotes("u1", "s-1", votes(1, 1, 1), NOW)
  await service.applyPeerVotes("u1", "s-2", votes(-1, -1), NOW)
  const h = await service.getHistory("u1")
  assert.equal(h.initialElo, 1004)
  assert.equal(h.currentElo, h.changes[0].eloAfter)
  assert.equal(h.initializedAt, "2026-01-01T00:00:00.000Z")
  assert.equal(h.changes.length, 2)
  assert.ok(h.changes[0].delta < 0)
  assert.deepEqual(h.changes[1], {
    reason: "PEER_RATING",
    delta: 43,
    eloBefore: 1004,
    eloAfter: 1047,
    createdAt: NOW.toISOString(),
  })
  assert.deepEqual(Object.keys(h.changes[0]).sort(), [
    "createdAt",
    "delta",
    "eloAfter",
    "eloBefore",
    "reason",
  ])
})

// ── PeerEloService (sweep) ─────────────────────────────────────────────

interface VoteDoc {
  _id: string
  raterId: string
  rateeId: string
  sessionId: string
  skillVote?: number
  eloPending?: boolean
  eloProcessedAt?: Date
  createdAt: Date
}

/** Giả lập collection ratings đủ cho hai aggregate, find và updateMany của sweep. */
function makeRatingModel(docs: VoteDoc[]) {
  return {
    docs,
    aggregate: (pipeline: Record<string, Record<string, unknown>>[]) => {
      const match = pipeline[0].$match
      if (match.eloPending === true) {
        const cutoff = (pipeline[2].$match as { firstVoteAt: { $lte: Date } })
          .firstVoteAt.$lte
        const groups = new Map<
          string,
          { _id: { sessionId: string; rateeId: string }; firstVoteAt: Date }
        >()
        for (const d of docs.filter((x) => x.eloPending)) {
          const key = `${d.sessionId}|${d.rateeId}`
          const g = groups.get(key)
          if (!g) {
            groups.set(key, {
              _id: { sessionId: d.sessionId, rateeId: d.rateeId },
              firstVoteAt: d.createdAt,
            })
          } else if (d.createdAt < g.firstVoteAt) g.firstVoteAt = d.createdAt
        }
        return Promise.resolve(
          [...groups.values()].filter((g) => g.firstVoteAt <= cutoff)
        )
      }
      // Phiếu kỹ năng đã xử lý trước đó của các rater cho cùng ratee.
      const raters = (match.raterId as { $in: string[] }).$in
      const counts = new Map<string, number>()
      for (const d of docs) {
        if (
          d.rateeId === match.rateeId &&
          raters.includes(d.raterId) &&
          d.skillVote !== undefined &&
          !d.eloPending
        ) {
          counts.set(d.raterId, (counts.get(d.raterId) ?? 0) + 1)
        }
      }
      return Promise.resolve(
        [...counts].map(([_id, count]) => ({ _id, count }))
      )
    },
    find: (f: { sessionId: string; rateeId: string }) => ({
      select: () => ({
        lean: () =>
          Promise.resolve(
            docs.filter(
              (d) =>
                d.sessionId === f.sessionId &&
                d.rateeId === f.rateeId &&
                d.eloPending
            )
          ),
      }),
    }),
    updateMany: (
      f: { _id: { $in: string[] } },
      u: { $set: { eloProcessedAt: Date } }
    ) => {
      for (const d of docs.filter((x) => f._id.$in.includes(x._id))) {
        delete d.eloPending
        d.eloProcessedAt = u.$set.eloProcessedAt
      }
      return Promise.resolve({})
    },
  }
}

let voteSeq = 0
const vote = (
  raterId: string,
  skillVote: number,
  overrides: Partial<VoteDoc> = {}
): VoteDoc => ({
  _id: `v${++voteSeq}`,
  raterId,
  rateeId: "u1",
  sessionId: "s-1",
  skillVote,
  eloPending: true,
  // Mặc định: cửa sổ thu phiếu đã đóng từ lâu.
  createdAt: new Date(NOW.getTime() - PEER_VOTE_WINDOW_MS - 60_000),
  ...overrides,
})

async function makeSweep(
  voteDocs: VoteDoc[],
  seed: Doc[] = [rating()],
  opts: {
    /** Số người thực sự chơi trận (chủ trận + roster "going"). */
    participants?: number
    /** Giá trị PEER_VOTE_WINDOW_MINUTES; bỏ trống = mặc định 24 giờ. */
    windowMinutes?: number
  } = {}
) {
  const ratingModel = makeRatingModel(voteDocs)
  const eloModel = makeEloModel(seed)
  const notified: { userId: string; id: string; text: string }[] = []
  const roster = Array.from(
    { length: (opts.participants ?? 4) - 1 },
    (_, i) => ({ userId: `p${i}`, rsvp: "going" })
  )
  const moduleRef = await Test.createTestingModule({
    providers: [
      PeerEloService,
      EloService,
      {
        provide: getModelToken(PlaySession.name),
        useValue: {
          findOne: () => ({
            sort: () => ({
              lean: () => Promise.resolve({ userId: "host", data: { roster } }),
            }),
          }),
        },
      },
      {
        provide: ConfigService,
        useValue: { get: () => opts.windowMinutes },
      },
      { provide: getModelToken(Rating.name), useValue: ratingModel },
      { provide: getModelToken(EloRating.name), useValue: eloModel },
      {
        provide: getModelToken(EloChange.name),
        useValue: { create: (d: Doc) => Promise.resolve(d) },
      },
      {
        provide: NotificationsService,
        useValue: {
          create: (userId: string, input: { id: string; text: string }) => {
            notified.push({ userId, id: input.id, text: input.text })
            return Promise.resolve()
          },
        },
      },
    ],
  }).compile()
  return {
    sweep: moduleRef.get(PeerEloService),
    ratingModel,
    eloModel,
    notified,
  }
}

void test("sweep áp phiếu khi cửa sổ đã đóng và báo cho người được chấm (ẩn danh)", async () => {
  const { sweep, ratingModel, eloModel, notified } = await makeSweep([
    vote("a", 1),
    vote("b", 1),
    vote("c", 1),
  ])
  assert.deepEqual(await sweep.run(NOW), {
    applied: 1,
    skipped: 0,
    deferred: 0,
  })
  assert.equal(eloModel.docs[0].currentElo, 1047)
  assert.ok(ratingModel.docs.every((d) => !d.eloPending && d.eloProcessedAt))

  assert.equal(notified.length, 1)
  assert.equal(notified[0].userId, "u1")
  assert.ok(notified[0].text.includes("+43"))
  assert.ok(notified[0].text.includes("1004 → 1047"))
  for (const rater of ["a", "b", "c"]) {
    assert.equal(notified[0].id.includes(`-${rater}`), false)
  }

  // Chạy lại: không còn gì trong hàng đợi.
  assert.deepEqual(await sweep.run(NOW), {
    applied: 0,
    skipped: 0,
    deferred: 0,
  })
  assert.equal(eloModel.docs[0].currentElo, 1047)
})

void test("sweep chờ cửa sổ 24h tính từ phiếu đầu tiên", async () => {
  const recent = new Date(NOW.getTime() - 60 * 60 * 1000)
  const { sweep, ratingModel, eloModel } = await makeSweep([
    vote("a", 1, { createdAt: recent }),
    vote("b", 1, { createdAt: recent }),
  ])
  assert.deepEqual(await sweep.run(NOW), {
    applied: 0,
    skipped: 0,
    deferred: 0,
  })
  assert.equal(eloModel.docs[0].currentElo, 1004)
  assert.ok(ratingModel.docs.every((d) => d.eloPending))
})

void test("sweep loại phiếu lẻ và phiếu đến muộn mà không đổi Elo", async () => {
  // Chỉ một người chấm: không đủ để ẩn danh.
  const single = await makeSweep([vote("a", 1)])
  assert.deepEqual(await single.sweep.run(NOW), {
    applied: 0,
    skipped: 1,
    deferred: 0,
  })
  assert.equal(single.eloModel.docs[0].currentElo, 1004)
  assert.equal(single.ratingModel.docs[0].eloPending, undefined)
  assert.equal(single.notified.length, 0)

  // Trận đã được tính: phiếu muộn bị loại.
  const late = await makeSweep(
    [vote("d", -1), vote("e", -1)],
    [rating({ peerAppliedSessions: ["s-1"], ratingUpdateCount: 1 })]
  )
  assert.deepEqual(await late.sweep.run(NOW), {
    applied: 0,
    skipped: 1,
    deferred: 0,
  })
  assert.equal(late.eloModel.docs[0].currentElo, 1004)
})

void test("sweep giảm trọng số người đã từng chấm kỹ năng cho cùng người chơi", async () => {
  const fresh = await makeSweep([vote("a", 1), vote("b", 1)])
  await fresh.sweep.run(NOW)
  // Trọng số 1 + 1: g = 1/3 → +33.
  assert.equal(fresh.eloModel.docs[0].currentElo, 1037)

  const repeated = await makeSweep([
    // "a" đã chấm u1 ở một trận trước (đã xử lý).
    vote("a", 1, { sessionId: "s-0", eloPending: undefined }),
    vote("a", 1),
    vote("b", 1),
  ])
  await repeated.sweep.run(NOW)
  // Trọng số 0.5 + 1: g = 150² / (150² + 300²/1.5) = 3/11 → +27.
  assert.equal(repeated.eloModel.docs[0].currentElo, 1031)
})

void test("phiếu 'đúng mức' không gửi thông báo đổi điểm", async () => {
  const { sweep, notified, eloModel } = await makeSweep([
    vote("a", 0),
    vote("b", 0),
  ])
  assert.equal((await sweep.run(NOW)).applied, 1)
  assert.equal(notified.length, 0)
  assert.equal(eloModel.docs[0].currentElo, 1004)
  assert.equal(eloModel.docs[0].ratingUpdateCount, 1)
})

void test("trận chỉ có 2 người: một phiếu là đủ, mức thay đổi nhỏ hơn", async () => {
  assert.equal(minVotersFor(2), 1)
  assert.equal(minVotersFor(3), 2)
  assert.equal(minVotersFor(4), 2)

  const { sweep, eloModel, notified } = await makeSweep(
    [vote("a", 1)],
    [rating()],
    { participants: 2 }
  )
  assert.deepEqual(await sweep.run(NOW), {
    applied: 1,
    skipped: 0,
    deferred: 0,
  })
  // Một phiếu: g = 150² / (150² + 300²) = 0.2 → +20 (so với +43 khi có 3 phiếu).
  assert.equal(eloModel.docs[0].currentElo, 1024)
  assert.equal(notified.length, 1)
})

void test("PEER_VOTE_WINDOW_MINUTES rút ngắn cửa sổ thu phiếu", async () => {
  const twentyMinAgo = new Date(NOW.getTime() - 20 * 60_000)
  const fresh = [
    vote("a", 1, { createdAt: twentyMinAgo }),
    vote("b", 1, { createdAt: twentyMinAgo }),
  ]
  // Mặc định 24 giờ: chưa đến hạn.
  const normal = await makeSweep(fresh.map((v) => ({ ...v })))
  assert.equal((await normal.sweep.run(NOW)).applied, 0)

  const short = await makeSweep(
    fresh.map((v) => ({ ...v })),
    [rating()],
    { windowMinutes: 15 }
  )
  assert.equal((await short.sweep.run(NOW)).applied, 1)
})
