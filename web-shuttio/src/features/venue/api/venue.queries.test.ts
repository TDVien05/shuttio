import { describe, expect, it } from "vitest"

import type { Reservation, VenueSeed } from "@/lib/shared"
import { applyReservationDecision } from "@/features/venue/api/venue.queries"

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "r1",
    customer: { name: "Mai", initials: "M" },
    sport: "badminton",
    court: "Sân 1",
    day: { en: "Today", vi: "Hôm nay" },
    time: "18:00 – 19:00",
    party: 2,
    source: "app",
    status: "pending",
    price: 180_000,
    noShowRisk: 5,
    isRegular: false,
    ...overrides,
  }
}

function venueSeed(reservations: Reservation[]): VenueSeed {
  // The decision helper only reads/writes `reservations`; the rest of the
  // bundle is irrelevant to this projection.
  return { reservations } as VenueSeed
}

describe("applyReservationDecision", () => {
  it("confirms only the target reservation", () => {
    const target = reservation()
    const other = reservation({ id: "r2", status: "confirmed" })
    const seed = venueSeed([target, other])

    const result = applyReservationDecision(seed, {
      id: "r1",
      decision: "approved",
    })

    expect(result?.reservations[0]?.status).toBe("confirmed")
    // Unrelated rows keep their identity.
    expect(result?.reservations[1]).toBe(other)
    // The source bundle is never mutated.
    expect(seed.reservations[0]?.status).toBe("pending")
  })

  it("cancels a declined reservation and records the reason", () => {
    const result = applyReservationDecision(venueSeed([reservation()]), {
      id: "r1",
      decision: "declined",
      reason: "Sân bảo trì",
    })

    expect(result?.reservations[0]).toMatchObject({
      status: "cancelled",
      declineReason: "Sân bảo trì",
    })
  })

  it("cancels a declined reservation without adding an empty reason", () => {
    const result = applyReservationDecision(venueSeed([reservation()]), {
      id: "r1",
      decision: "declined",
    })

    expect(result?.reservations[0]?.status).toBe("cancelled")
    expect(result?.reservations[0]).not.toHaveProperty("declineReason")
  })

  it("preserves an empty cache", () => {
    expect(
      applyReservationDecision(undefined, {
        id: "r1",
        decision: "approved",
      })
    ).toBeUndefined()
  })
})
