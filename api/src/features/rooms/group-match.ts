import {
  attendanceClosesAt,
  attendedIds,
  checkInWindow,
  isRanked,
  isSelfCourt,
  seatHolderIds,
  sessionEndMsOf,
  type GroupMatch,
  type PlaySession as PlaySessionData,
} from "../../shared/index.js"

// Pure projections of a stored PlaySession into the "match a group chat is
// coordinating" view — shared by `RoomsService#groupMatch` (what members see)
// and `RatingsService` (who may rate whom, and only once the match is over).

/**
 * A court is actually held/paid for this session — not merely proposed. A
 * self-booked room counts once the host says the court is booked.
 */
export function isSessionBooked(data: PlaySessionData): boolean {
  if (data.status === "cancelled") return false
  if (isSelfCourt(data)) {
    return data.status === "completed" || Boolean(data.selfCourt?.confirmed)
  }
  return (
    data.status === "booked" ||
    data.status === "completed" ||
    Boolean(data.reservationId)
  )
}

/** Epoch ms the session's slot ends, or null when no slot is set. */
export function sessionEndMs(data: PlaySessionData): number | null {
  return sessionEndMsOf(data)
}

/**
 * The match has been played: completed, or a booked slot that has ended. A
 * self-booked match has no booking to wait for — once its slot is over it
 * has ended, and who actually played comes from attendance instead.
 */
export function isSessionEnded(data: PlaySessionData, now: number): boolean {
  if (data.status === "completed") return true
  if (data.status === "cancelled") return false
  if (!isSelfCourt(data) && !isSessionBooked(data)) return false
  const end = sessionEndMs(data)
  return end !== null && end <= now
}

/**
 * Everyone who plays in the session, as Clerk ids: the host (the doc's
 * owner) plus confirmed roster members that are real users. Requested /
 * pending / declined entries and client-only mock invitees (no `userId`)
 * are excluded. In a self-booked match only seat holders whose attendance
 * was confirmed (on-site check-in, or vouched for by someone there) count —
 * nobody can rate, or be rated for, a match they didn't turn up to.
 */
export function sessionParticipantIds(
  hostUserId: string,
  data: PlaySessionData
): string[] {
  return isSelfCourt(data)
    ? attendedIds(hostUserId, data)
    : seatHolderIds(hostUserId, data)
}

export function toGroupMatch(
  hostUserId: string,
  data: PlaySessionData,
  now: number
): GroupMatch {
  return {
    sessionId: data.id,
    hostUserId,
    title: data.title,
    status: data.status,
    venue: data.venue,
    courtLabel: data.courtLabel,
    dayKey: data.dayKey,
    slot: data.slot,
    durationMin: data.durationMin,
    ...(data.startAt ? { startAt: data.startAt } : {}),
    ...(data.endAt ? { endAt: data.endAt } : {}),
    ...(data.hold ? { hold: data.hold } : {}),
    ...(data.paymentStatus ? { paymentStatus: data.paymentStatus } : {}),
    booked: isSessionBooked(data),
    ended: isSessionEnded(data, now),
    participantIds: sessionParticipantIds(hostUserId, data),
    courtMode: data.courtMode ?? "app",
    ranked: isRanked(data),
    ...(isSelfCourt(data) ? selfCourtMatchFields(hostUserId, data) : {}),
  }
}

/** Attendance state a self-booked match's chat shows its members. */
function selfCourtMatchFields(
  hostUserId: string,
  data: PlaySessionData
): Partial<GroupMatch> {
  const window = checkInWindow(data)
  const closes = attendanceClosesAt(data)
  return {
    attendance: data.attendance ?? {},
    memberIds: seatHolderIds(hostUserId, data),
    ...(window
      ? { checkInOpensAt: new Date(window.opensAt).toISOString() }
      : {}),
    ...(closes !== null
      ? { attendanceClosesAt: new Date(closes).toISOString() }
      : {}),
  }
}
