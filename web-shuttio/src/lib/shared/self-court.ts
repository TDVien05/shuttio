// Rules for self-booked rooms (`courtMode: "self"`): the host books a court
// directly with a venue that isn't on the app yet, players meet through the
// room, then rate each other. With no venue to vouch that the match happened,
// presence is established by on-site GPS check-in (or a player already there
// confirming another), and only confirmed players may rate or be rated.
// Pure helpers — kept in sync by hand with the copy in the other app.

import type { AttendanceMark, PlaySession, ReliabilitySummary } from "./types"
import { combineDateTime } from "./helpers"

/** How close (metres) to the pinned court a GPS check-in must be. */
export const SELF_CHECKIN_RADIUS_M = 300
/** Check-in opens this long before the start… */
export const SELF_CHECKIN_OPENS_BEFORE_MS = 30 * 60_000
/** …and players already there can confirm others until this long after the end. */
export const SELF_ATTENDANCE_GRACE_MS = 24 * 60 * 60_000
/** Giving up a seat (or cancelling) within this window before the start is a late cancel. */
export const LATE_CANCEL_WINDOW_MS = 12 * 60 * 60_000
/** The host is reminded to confirm the court this long before the start… */
export const SELF_COURT_REMIND_BEFORE_MS = 6 * 60 * 60_000
/** …and an unconfirmed room is cancelled this long before the start. */
export const SELF_COURT_CONFIRM_DEADLINE_MS = 2 * 60 * 60_000
/** Most a player can be asked to chip in (VND) — a typo guard. */
export const SELF_COST_MAX = 1_000_000
/** A ranked self-booked match moves Elo only with this many GPS check-ins. */
export const SELF_RANKED_MIN_GPS = 2

/** History the reliability summary covers. */
export const RELIABILITY_WINDOW_DAYS = 90
/** This many no-shows within `NO_SHOW_STRIKE_DAYS`… */
export const NO_SHOW_STRIKES = 2
export const NO_SHOW_STRIKE_DAYS = 30
/** …blocks joining new rooms for this long after the latest one. */
export const NO_SHOW_RESTRICT_DAYS = 7

export function isSelfCourt(s: Pick<PlaySession, "courtMode">): boolean {
  return s.courtMode === "self"
}

/** Peer skill votes count toward Elo (absent = ranked). */
export function isRanked(s: Pick<PlaySession, "ranked">): boolean {
  return s.ranked !== false
}

/** Epoch ms the session starts, or null when no slot is set. */
export function sessionStartMsOf(
  s: Pick<PlaySession, "startAt" | "dayKey" | "slot">
): number | null {
  if (s.startAt) {
    const t = Date.parse(s.startAt)
    if (Number.isFinite(t)) return t
  }
  if (!s.slot || !/^\d{4}-\d{2}-\d{2}$/.test(s.dayKey)) return null
  const t = Date.parse(combineDateTime(s.dayKey, s.slot))
  return Number.isFinite(t) ? t : null
}

/** Epoch ms the session ends, or null when no slot is set. */
export function sessionEndMsOf(
  s: Pick<PlaySession, "startAt" | "endAt" | "dayKey" | "slot" | "durationMin">
): number | null {
  if (s.endAt) {
    const t = Date.parse(s.endAt)
    if (Number.isFinite(t)) return t
  }
  const start = sessionStartMsOf(s)
  return start === null ? null : start + s.durationMin * 60_000
}

/** When GPS check-in is accepted: from 30 min before the start until the end. */
export function checkInWindow(
  s: Pick<PlaySession, "startAt" | "endAt" | "dayKey" | "slot" | "durationMin">
): { opensAt: number; closesAt: number } | null {
  const start = sessionStartMsOf(s)
  const end = sessionEndMsOf(s)
  if (start === null || end === null) return null
  return { opensAt: start - SELF_CHECKIN_OPENS_BEFORE_MS, closesAt: end }
}

/** Last moment a player already there may confirm another's attendance. */
export function attendanceClosesAt(
  s: Pick<PlaySession, "startAt" | "endAt" | "dayKey" | "slot" | "durationMin">
): number | null {
  const end = sessionEndMsOf(s)
  return end === null ? null : end + SELF_ATTENDANCE_GRACE_MS
}

/** Precise great-circle distance in metres. */
export function metersBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) *
      Math.cos(rad(b.lat)) *
      Math.sin(rad(b.lng - a.lng) / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(Math.min(1, h)))
}

/** Valid WGS84 coordinates. */
export function isLatLng(v: unknown): v is { lat: number; lng: number } {
  if (!v || typeof v !== "object") return false
  const { lat, lng } = v as { lat?: unknown; lng?: unknown }
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  )
}

/**
 * Everyone holding a seat, as Clerk ids: the host (doc owner) plus `going`
 * roster members that are real users.
 */
export function seatHolderIds(
  hostUserId: string,
  s: Pick<PlaySession, "roster">
): string[] {
  const ids = new Set<string>([hostUserId])
  for (const p of s.roster) {
    if (p.userId && (p.rsvp === "going" || p.rsvp === "host")) ids.add(p.userId)
  }
  return [...ids]
}

/** Seat holders whose attendance at a self-booked match is confirmed. */
export function attendedIds(
  hostUserId: string,
  s: Pick<PlaySession, "roster" | "attendance">
): string[] {
  const marks: Partial<Record<string, AttendanceMark>> = s.attendance ?? {}
  return seatHolderIds(hostUserId, s).filter((id) => Boolean(marks[id]))
}

/** Confirmed attendees that checked in on site themselves. */
export function gpsCheckInCount(
  hostUserId: string,
  s: Pick<PlaySession, "roster" | "attendance">
): number {
  const marks: Partial<Record<string, AttendanceMark>> = s.attendance ?? {}
  return attendedIds(hostUserId, s).filter((id) => marks[id]?.via === "gps")
    .length
}

/** Show-up score: attended ÷ (attended + no-shows + ½·late cancels), 0–100. */
export function reliabilityScore(
  c: Pick<ReliabilitySummary, "attended" | "noShows" | "lateCancels">
): number | null {
  const denom = c.attended + c.noShows + c.lateCancels * 0.5
  if (denom <= 0) return null
  return Math.round((c.attended / denom) * 100)
}
