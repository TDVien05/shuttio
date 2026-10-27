import assert from "node:assert/strict"
import { test } from "node:test"

import "reflect-metadata"

import { BadRequestException, ConflictException } from "@nestjs/common"
import { getModelToken } from "@nestjs/mongoose"
import { Test } from "@nestjs/testing"

import { EloRating } from "../src/features/elo/elo-rating.schema.js"
import { EloService } from "../src/features/elo/elo.service.js"
import {
  INITIAL_ASSESSMENT_QUESTIONS,
  INITIAL_ASSESSMENT_VERSION,
  toPublicQuestions,
} from "../src/features/elo/initial-assessment.questions.js"
import {
  MAX_RAW_SCORE,
  classifyElo,
  computeInitialElo,
  evaluateAssessment,
  levelForElo,
} from "../src/features/elo/initial-assessment.scoring.js"

/**
 * Elo khởi tạo từ bảng hỏi: công thức, nhãn, validate, cảnh báo, idempotent,
 * conflict, bỏ qua → làm bảng hỏi một lần, và không lộ dữ liệu nội bộ.
 */

const V = INITIAL_ASSESSMENT_VERSION

/** Dựng payload từ chuỗi đáp án 7 ký tự, vd. "BCCBCBC". */
function payload(letters: string) {
  return letters.split("").map((optionId, i) => ({
    questionId: `Q${i + 1}`,
    optionId,
  }))
}

// ── Mô hình Mongo giả lập đủ cho EloService ─────────────────────────────

type Doc = Record<string, unknown>

/**
 * Giả lập một collection với unique (userId, discipline): hỗ trợ
 * updateOne(filter, $set | $setOnInsert, upsert) và findOne().lean().
 * Filter chỉ gồm so sánh bằng, đủ cho các truy vấn của service.
 */
function makeFakeModel(seed: Doc[] = []) {
  const docs: Doc[] = seed.map((d) => ({ ...d }))
  const matches = (d: Doc, f: Doc) =>
    Object.entries(f).every(([k, v]) => d[k] === v)
  return {
    docs,
    findOne: (filter: Doc) => ({
      lean: () => Promise.resolve(docs.find((d) => matches(d, filter)) ?? null),
    }),
    updateOne: (
      filter: Doc,
      update: { $set?: Doc; $setOnInsert?: Doc },
      opts?: { upsert?: boolean }
    ) => {
      const found = docs.find((d) => matches(d, filter))
      if (found) {
        if (update.$set) Object.assign(found, update.$set)
        return Promise.resolve({
          matchedCount: 1,
          modifiedCount: update.$set ? 1 : 0,
          upsertedCount: 0,
        })
      }
      if (opts?.upsert && update.$setOnInsert) {
        docs.push({ ...update.$setOnInsert })
        return Promise.resolve({
          matchedCount: 0,
          modifiedCount: 0,
          upsertedCount: 1,
        })
      }
      return Promise.resolve({
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 0,
      })
    },
  }
}

async function makeService(seed: Doc[] = []) {
  const model = makeFakeModel(seed)
  const moduleRef = await Test.createTestingModule({
    providers: [
      EloService,
      { provide: getModelToken(EloRating.name), useValue: model },
    ],
  }).compile()
  return { service: moduleRef.get(EloService), model }
}

// ── Công thức & nhãn ───────────────────────────────────────────────────

void test("toàn A → 800 Mới bắt đầu; toàn D → 1200 Nâng cao", () => {
  const a = evaluateAssessment(V, payload("AAAAAAA"))
  assert.equal(a.rawScore, 0)
  assert.equal(a.elo, 800)
  assert.equal(a.label.name, "Mới bắt đầu")

  const d = evaluateAssessment(V, payload("DDDDDDD"))
  assert.equal(d.rawScore, 45)
  assert.equal(d.elo, 1200)
  assert.equal(d.label.name, "Nâng cao")
})

void test("ví dụ [B,C,C,B,C,B,C] → score 23, Elo 1004, Trung bình", () => {
  const r = evaluateAssessment(V, payload("BCCBCBC"))
  assert.equal(r.rawScore, 23)
  assert.equal(r.elo, 1004)
  assert.equal(r.label.name, "Trung bình")
})

void test("max_score = 45 và công thức đúng với mọi score nguyên 0–45", () => {
  assert.equal(MAX_RAW_SCORE, 45)
  for (let raw = 0; raw <= 45; raw++) {
    // Tham chiếu dấu phẩy động; không có điểm nào rơi đúng nửa đơn vị.
    const exact = 800 + (raw * 400) / 45
    assert.equal(computeInitialElo(raw), Math.round(exact), `raw=${raw}`)
  }
  assert.throws(() => computeInitialElo(-1), RangeError)
  assert.throws(() => computeInitialElo(46), RangeError)
  assert.throws(() => computeInitialElo(1.5), RangeError)
})

void test("nhãn đúng tại các cận", () => {
  const code = (n: number) => classifyElo(n).code
  assert.equal(code(849), "BEGINNER")
  assert.equal(code(850), "BASIC")
  assert.equal(code(949), "BASIC")
  assert.equal(code(950), "INTERMEDIATE")
  assert.equal(code(1049), "INTERMEDIATE")
  assert.equal(code(1050), "ADVANCED")
  assert.equal(code(1149), "ADVANCED")
  assert.equal(code(1150), "HIGH")
})

// ── Validate ───────────────────────────────────────────────────────────

void test("payload sai bị từ chối (400)", () => {
  const ok = payload("BCCBCBC")
  const bad: [string, unknown, unknown][] = [
    ["sai version", "initial_doubles_v0", ok],
    ["version sai kiểu", 1, ok],
    ["answers không phải list", V, { Q1: "A" }],
    ["thiếu câu", V, ok.slice(0, 6)],
    ["thừa câu", V, [...ok, { questionId: "Q8", optionId: "A" }]],
    ["trùng câu", V, [...ok.slice(0, 6), { questionId: "Q1", optionId: "A" }]],
    [
      "đáp án ngoài A–D",
      V,
      [...ok.slice(0, 6), { questionId: "Q7", optionId: "E" }],
    ],
    [
      "đáp án chữ thường",
      V,
      [...ok.slice(0, 6), { questionId: "Q7", optionId: "a" }],
    ],
    [
      "optionId sai kiểu",
      V,
      [...ok.slice(0, 6), { questionId: "Q7", optionId: 1 }],
    ],
    [
      "mục có trường lạ",
      V,
      [...ok.slice(0, 6), { questionId: "Q7", optionId: "A", points: 3 }],
    ],
    ["mục null", V, [...ok.slice(0, 6), null]],
    ["mục là chuỗi", V, [...ok.slice(0, 6), "Q7A"]],
  ]
  for (const [name, version, answers] of bad) {
    assert.throws(
      () => evaluateAssessment(version, answers),
      BadRequestException,
      name
    )
  }
})

void test("payload sai không ghi dữ liệu", async () => {
  const { service, model } = await makeService()
  await assert.rejects(
    service.submitAssessment("u1", V, payload("BCCBCB")),
    BadRequestException
  )
  await assert.rejects(
    service.submitAssessment("u1", "x", payload("BCCBCBC")),
    BadRequestException
  )
  assert.equal(model.docs.length, 0)
})

// ── Cảnh báo không nhất quán ───────────────────────────────────────────

void test("cảnh báo khi Q1=A và Q2–Q6=D, bất kể Q7", () => {
  assert.equal(
    evaluateAssessment(V, payload("ADDDDDA")).inconsistencyWarning,
    true
  )
  assert.equal(
    evaluateAssessment(V, payload("ADDDDDD")).inconsistencyWarning,
    true
  )
})

void test("không cảnh báo sai khi Q1≠A hoặc một câu Q2–Q6 ≠ D", () => {
  assert.equal(
    evaluateAssessment(V, payload("BDDDDDD")).inconsistencyWarning,
    false
  )
  for (let i = 1; i <= 5; i++) {
    const letters = "ADDDDDD".split("")
    letters[i] = "C"
    assert.equal(
      evaluateAssessment(V, payload(letters.join(""))).inconsistencyWarning,
      false,
      `Q${i + 1}`
    )
  }
})

void test("cảnh báo không chặn gửi và không đổi điểm", async () => {
  const { service } = await makeService()
  const res = await service.submitAssessment("u1", V, payload("ADDDDDA"))
  assert.equal(res.inconsistencyWarning, true)
  assert.ok(res.warningMessage)
  assert.equal(res.elo, computeInitialElo(0 + 2 * 3 + 2 * 3 + 3 * 3 * 3))
})

void test("previewWarning chỉ trả cờ, không ghi gì", async () => {
  const { service, model } = await makeService()
  assert.deepEqual(
    { w: service.previewWarning(V, payload("ADDDDDA")).inconsistencyWarning },
    { w: true }
  )
  assert.equal(
    service.previewWarning(V, payload("BCCBCBC")).warningMessage,
    null
  )
  assert.equal(model.docs.length, 0)
})

// ── Lưu, idempotent, conflict ──────────────────────────────────────────

void test("gửi lần đầu lưu PROVISIONAL kèm snapshot, current = initial", async () => {
  const { service, model } = await makeService()
  const res = await service.submitAssessment("u1", V, payload("BCCBCBC"))
  assert.equal(res.initialized, true)
  assert.equal(res.elo, 1004)
  assert.equal(res.status, "PROVISIONAL")
  assert.equal(res.source, "ASSESSMENT")
  assert.ok(res.completedAt)
  assert.ok(res.notice?.includes("chưa được xác minh"))
  assert.equal(res.canTakeAssessment, false)

  const stored = model.docs[0]
  assert.equal(stored.currentElo, 1004)
  assert.equal(stored.initialElo, 1004)
  assert.equal(stored.assessmentScore, 23)
  assert.equal(stored.assessmentVersion, V)
  assert.equal((stored.questionSnapshot as unknown[]).length, 7)
  assert.equal(stored.ratingUpdateCount, 0)
})

void test("gửi lại cùng payload là idempotent (không đổi timestamp)", async () => {
  const { service, model } = await makeService()
  const first = await service.submitAssessment("u1", V, payload("BCCBCBC"))
  const again = await service.submitAssessment("u1", V, payload("BCCBCBC"))
  assert.deepEqual(again, first)
  assert.equal(model.docs.length, 1)
})

void test("payload khác sau khi hoàn tất → 409, giữ nguyên dữ liệu", async () => {
  const { service, model } = await makeService()
  await service.submitAssessment("u1", V, payload("BCCBCBC"))
  await assert.rejects(
    service.submitAssessment("u1", V, payload("DDDDDDD")),
    ConflictException
  )
  assert.equal(model.docs[0].currentElo, 1004)
})

void test("gửi đồng thời cùng user không cấp điểm hai lần", async () => {
  const { service, model } = await makeService()
  const results = await Promise.allSettled([
    service.submitAssessment("u1", V, payload("BCCBCBC")),
    service.submitAssessment("u1", V, payload("DDDDDDD")),
  ])
  assert.equal(model.docs.length, 1)
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1)
  assert.equal(
    results.filter(
      (r) => r.status === "rejected" && r.reason instanceof ConflictException
    ).length,
    1
  )
})

void test("mỗi user có rating riêng", async () => {
  const { service } = await makeService()
  await service.submitAssessment("u1", V, payload("AAAAAAA"))
  const other = await service.getResult("u2")
  assert.equal(other.initialized, false)
})

// ── Elo mặc định cũ (người từng bỏ qua trước khi bảng hỏi trở thành bắt buộc) ──

/** Document DEFAULT như các tài khoản cũ đã có; không còn API nào tạo ra nó. */
function legacyDefault(overrides: Doc = {}): Doc {
  return {
    userId: "u1",
    discipline: "DOUBLES",
    currentElo: 1000,
    initialElo: 1000,
    status: "PROVISIONAL",
    source: "DEFAULT",
    assessmentScore: null,
    assessmentVersion: null,
    answers: null,
    inconsistencyWarning: false,
    ratingUpdateCount: 0,
    completedAt: null,
    initializedAt: new Date(),
    ...overrides,
  }
}

void test("không còn cách bỏ qua: service không có skipAssessment", async () => {
  const { service } = await makeService()
  assert.equal("skipAssessment" in service, false)
})

void test("DEFAULT cũ được làm bảng hỏi một lần; sau đó không đổi được", async () => {
  const { service } = await makeService([legacyDefault()])
  const before = await service.getResult("u1")
  assert.equal(before.elo, 1000)
  assert.equal(before.canTakeAssessment, true)

  const res = await service.submitAssessment("u1", V, payload("DDDDDDD"))
  assert.equal(res.elo, 1200)
  assert.equal(res.source, "ASSESSMENT")
  assert.ok(res.completedAt)

  await assert.rejects(
    service.submitAssessment("u1", V, payload("AAAAAAA")),
    ConflictException
  )
  assert.equal((await service.getResult("u1")).elo, 1200)
})

void test("DEFAULT đã có cập nhật rating hoặc nguồn lạ → 409, không ghi đè", async () => {
  const base = {
    userId: "u1",
    discipline: "DOUBLES",
    currentElo: 1030,
    initialElo: 1000,
    status: "PROVISIONAL",
    assessmentScore: null,
    assessmentVersion: null,
    answers: null,
    initializedAt: new Date(),
  }
  const updated = await makeService([
    { ...base, source: "DEFAULT", ratingUpdateCount: 2 },
  ])
  await assert.rejects(
    updated.service.submitAssessment("u1", V, payload("DDDDDDD")),
    ConflictException
  )
  assert.equal(updated.model.docs[0].currentElo, 1030)

  const unknown = await makeService([
    { ...base, source: "LEGACY", ratingUpdateCount: 0 },
  ])
  await assert.rejects(
    unknown.service.submitAssessment("u1", V, payload("DDDDDDD")),
    ConflictException
  )
  assert.equal(unknown.model.docs[0].currentElo, 1030)
})

// ── Không lộ dữ liệu nội bộ ────────────────────────────────────────────

void test("API công khai không trả note, điểm gốc hay trọng số", async () => {
  const { service } = await makeService()
  const pub = service.getPublicAssessment()
  assert.equal(pub.version, V)
  assert.equal(pub.questions.length, 7)
  assert.deepEqual(
    pub.questions.map((q) => q.id),
    ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7"]
  )
  for (const q of pub.questions) {
    assert.deepEqual(
      q.options.map((o) => o.id),
      ["A", "B", "C", "D"]
    )
  }
  const json = JSON.stringify(pub)
  assert.ok(!/internalNote|weight|points|note/i.test(json))
  for (const q of INITIAL_ASSESSMENT_QUESTIONS) {
    assert.ok(!json.includes(q.internalNote))
  }

  const result = JSON.stringify(
    await service.submitAssessment("u1", V, payload("BCCBCBC"))
  )
  assert.ok(
    !/internalNote|weight|points|answers|questionSnapshot|assessmentScore/.test(
      result
    )
  )
})

void test("mỗi câu hỏi có đúng 4 lựa chọn điểm 0–3 và note nội bộ", () => {
  assert.equal(toPublicQuestions().length, 7)
  for (const q of INITIAL_ASSESSMENT_QUESTIONS) {
    assert.deepEqual(
      q.options.map((o) => o.points),
      [0, 1, 2, 3]
    )
    assert.ok(q.internalNote.length > 0)
  }
  assert.deepEqual(
    INITIAL_ASSESSMENT_QUESTIONS.map((q) => q.weight),
    [1, 2, 2, 3, 3, 3, 1]
  )
})

// ── Dùng chung cho dashboard / hồ sơ ───────────────────────────────────

void test("levelForElo chia nhóm thô tại các cận 949|950 và 1049|1050", () => {
  assert.equal(levelForElo(800), "beginner")
  assert.equal(levelForElo(949), "beginner")
  assert.equal(levelForElo(950), "intermediate")
  assert.equal(levelForElo(1049), "intermediate")
  assert.equal(levelForElo(1050), "advanced")
  assert.equal(levelForElo(1200), "advanced")
})

void test("getPlayerElo là null khi chưa có rating, có level khi đã có", async () => {
  const { service } = await makeService()
  assert.equal(await service.getPlayerElo("u1"), null)
  assert.deepEqual(await service.getPublicLevels("u1"), [])

  await service.submitAssessment("u1", V, payload("BCCBCBC"))
  const p = await service.getPlayerElo("u1")
  assert.equal(p?.elo, 1004)
  assert.equal(p?.level, "intermediate")
  assert.equal(p?.canTakeAssessment, false)
  assert.deepEqual(await service.getPublicLevels("u1"), [
    { sport: "badminton", level: "intermediate", elo: 1004, label: p?.label },
  ])
})

void test("DEFAULT cũ vẫn là có rating: getPlayerElo trả 1000 và còn được làm bảng hỏi", async () => {
  const { service } = await makeService([legacyDefault()])
  const p = await service.getPlayerElo("u1")
  assert.equal(p?.elo, 1000)
  assert.equal(p?.source, "DEFAULT")
  assert.equal(p?.canTakeAssessment, true)
})
