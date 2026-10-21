import {
  courtDayBusy,
  courtDayGaps,
  isRsvpExpired,
  rangesOverlap,
  sessionToBooking,
  sessionToRoom,
} from "@/lib/shared"
import type {
  Booking,
  Court,
  CourtBand,
  Conflict,
  MatchRoom,
  PlaySession,
  User,
} from "@/lib/shared"

/** `GET /api/rooms` is stored unvalidated; drop docs a dashboard can't read. */
export function wellFormedRooms(remote: unknown): PlaySession[] {
  if (!Array.isArray(remote)) return []
  return remote.filter(
    (r): r is PlaySession =>
      typeof r === "object" &&
      r !== null &&
      typeof (r as PlaySession).id === "string" &&
      Array.isArray((r as PlaySession).roster)
  )
}

/** My own session ids — everything else in `crossRooms` belongs to someone else. */
export function ownSessionIds(sessions: PlaySession[]): Set<string> {
  return new Set(sessions.map((s) => s.id))
}

/** Other users' listed rooms, minus anything that round-tripped into my docs. */
export function deriveOtherRooms(
  sessions: PlaySession[],
  crossRooms: PlaySession[]
): PlaySession[] {
  const own = ownSessionIds(sessions)
  return crossRooms.filter((room) => !own.has(room.id))
}

/** Cross-user rooms where I hold a confirmed (non-host) seat. */
export function deriveRemoteJoinedIds(
  otherRooms: PlaySession[],
  userId: string
): Set<string> {
  return new Set(
    otherRooms
      .filter((room) =>
        room.roster.some((p) => p.userId === userId && p.rsvp === "going")
      )
      .map((room) => room.id)
  )
}

/** Listed, still-active rooms I host, derived from my own session docs. */
export function deriveHostedIds(
  sessions: PlaySession[],
  userInitials: string
): Set<string> {
  return new Set(
    sessions
      .filter(
        (s) =>
          s.listed &&
          !s.demo &&
          s.host.initials === userInitials &&
          s.status !== "cancelled" &&
          s.status !== "completed"
      )
      .map((s) => s.id)
  )
}

/** The unified "joined" set: my local bookkeeping, hosted rooms and remote seats. */
export function deriveJoinedIds(
  localJoinedIds: ReadonlySet<string>,
  hostedIds: ReadonlySet<string>,
  remoteJoinedIds: ReadonlySet<string>
): Set<string> {
  return new Set([...localJoinedIds, ...hostedIds, ...remoteJoinedIds])
}

/** Rooms I asked to join and am still awaiting a host decision on. */
export function deriveRequestedIds(
  otherRooms: PlaySession[],
  userId: string
): Set<string> {
  return new Set(
    otherRooms
      .filter((room) =>
        room.roster.some((p) => p.userId === userId && p.rsvp === "requested")
      )
      .map((room) => room.id)
  )
}

/** Sessions the player is committed to at a real time (host/going/requested). */
export function deriveCommittedSessions(
  sessions: PlaySession[],
  otherRooms: PlaySession[],
  userInitials: string,
  userId: string
): PlaySession[] {
  return [
    ...sessions.filter(
      (s) =>
        s.status !== "cancelled" &&
        s.status !== "completed" &&
        s.slot != null &&
        s.roster.some(
          (p) => p.initials === userInitials && p.rsvp !== "declined"
        )
    ),
    ...otherRooms.filter(
      (s) =>
        s.status !== "cancelled" &&
        s.status !== "completed" &&
        s.slot != null &&
        s.roster.some(
          (p) => p.userId === userId && p.rsvp !== "declined"
        )
    ),
  ]
}

/** The committed session whose time overlaps `room`, if any. */
export function overlappingCommitment(
  room: MatchRoom,
  sessions: PlaySession[],
  otherRooms: PlaySession[],
  committed: PlaySession[]
): PlaySession | null {
  const target =
    sessions.find((s) => s.id === room.id) ??
    otherRooms.find((s) => s.id === room.id)
  if (!target || target.slot == null) return null
  return (
    committed.find(
      (s) =>
        s.id !== target.id &&
        s.dayKey === target.dayKey &&
        rangesOverlap(
          target.slot!,
          target.durationMin,
          s.slot!,
          s.durationMin
        )
    ) ?? null
  )
}

/** My joined sessions (own docs + remote rooms), newest state included. */
export function deriveJoinedSessions(
  sessions: PlaySession[],
  otherRooms: PlaySession[],
  localJoinedIds: ReadonlySet<string>,
  hostedIds: ReadonlySet<string>,
  remoteJoinedIds: ReadonlySet<string>
): PlaySession[] {
  return [
    ...sessions.filter(
      (s) =>
        (localJoinedIds.has(s.id) || hostedIds.has(s.id)) &&
        s.status !== "cancelled" &&
        s.status !== "completed"
    ),
    ...otherRooms.filter(
      (r) =>
        remoteJoinedIds.has(r.id) &&
        r.status !== "cancelled" &&
        r.status !== "completed"
    ),
  ]
}

/** Resolve a session's court distance for the viewer's list. */
export function roomForViewer(
  session: PlaySession,
  courts: Court[]
): MatchRoom {
  const room = sessionToRoom(session)
  const court = courts.find((c) =>
    room.courtId ? c.id === room.courtId : c.name === room.venue
  )
  return { ...room, distanceKm: court?.distanceKm ?? null }
}

/** The browse pool: my listed sessions + other users' rooms. */
export function deriveRooms(
  sessions: PlaySession[],
  otherRooms: PlaySession[],
  courts: Court[]
): MatchRoom[] {
  return [
    ...sessions
      .filter((s) => s.listed && s.status !== "cancelled")
      .map((s) => roomForViewer(s, courts)),
    ...otherRooms.map((s) => roomForViewer(s, courts)),
  ]
}

/** The room currently open in the active-room sheet, falling back to the first. */
export function deriveActiveSession(
  joinedSessions: PlaySession[],
  activeSessionId: string | null
): PlaySession | null {
  return (
    joinedSessions.find((s) => s.id === activeSessionId) ??
    joinedSessions.at(0) ??
    null
  )
}

/** Booked/completed/cancelled sessions projected to the legacy Booking shape. */
export function deriveBookings(
  sessions: PlaySession[],
  courts: Court[]
): Booking[] {
  return sessions
    .filter(
      (s) =>
        s.status === "booked" ||
        s.status === "completed" ||
        s.status === "cancelled"
    )
    .map((s) => sessionToBooking(courts, s))
}

/** A room can be joined when it has room, isn't mine and isn't a demo seed. */
export function isRoomSuitable(
  room: MatchRoom,
  joinedIds: ReadonlySet<string>
): boolean {
  return room.joined < room.capacity && !joinedIds.has(room.id) && !room.demo
}

/** How many listed, still-active rooms the player hosts (anti-spam cap). */
export function hostedRoomCount(
  sessions: PlaySession[],
  userInitials: string
): number {
  return sessions.filter(
    (s) =>
      s.host.initials === userInitials &&
      s.listed &&
      s.status !== "cancelled" &&
      s.status !== "completed"
  ).length
}

/**
 * Expired holds and RSVPs, derived from the server's view. The client never
 * rewrites cache data to make these disappear; it hides them and toasts once.
 */
export interface DerivedExpiries {
  /** Forming sessions whose court hold has lapsed. */
  heldExpired: PlaySession[]
  /** Roster entries whose request/invite TTL has lapsed. */
  rsvpExpired: {
    session: PlaySession
    player: PlaySession["roster"][number]
  }[]
}

export function deriveExpiries(
  sessions: PlaySession[],
  now: number
): DerivedExpiries {
  const heldExpired: PlaySession[] = []
  const rsvpExpired: DerivedExpiries["rsvpExpired"] = []
  for (const session of sessions) {
    if (
      session.status === "forming" &&
      session.holdExpiresAt != null &&
      session.holdExpiresAt <= now
    ) {
      heldExpired.push(session)
    }
    for (const player of session.roster) {
      if (isRsvpExpired(player, now)) rsvpExpired.push({ session, player })
    }
  }
  return { heldExpired, rsvpExpired }
}

/** The court the wizard is booking, or null for a courtless (find-players) draft. */
export function draftCourt(
  courts: Court[],
  courtId: string | null
): Court | null {
  return courtId ? (courts.find((c) => c.id === courtId) ?? null) : null
}

/** Client-side conflict pre-check for a single candidate start time. */
export function slotBlocked(
  sessions: PlaySession[],
  courts: Court[],
  user: User,
  courtId: string | null,
  dayKey: string,
  slot: string,
  durationMin: number,
  ignoreId?: string
): boolean {
  const court = draftCourt(courts, courtId)
  if (!court) return false
  return (
    conflictFor(courts, user, sessions, {
      courtId: court.id,
      dayKey,
      slot,
      durationMin,
      ignoreId,
    }) !== null
  )
}

/** Conflict details for the wizard's current slot (or null). */
export function draftConflict(
  sessions: PlaySession[],
  courts: Court[],
  user: User,
  courtId: string | null,
  dayKey: string,
  slot: string | null,
  durationMin: number,
  ignoreId?: string
): Conflict {
  const court = draftCourt(courts, courtId)
  if (!court || !slot) return null
  return conflictFor(courts, user, sessions, {
    courtId: court.id,
    dayKey,
    slot,
    durationMin,
    ignoreId,
  })
}

/** Busy bands on the draft court/day (calendar). */
export function courtBusy(
  sessions: PlaySession[],
  courts: Court[],
  courtId: string | null,
  dayKey: string,
  ignoreId?: string
): CourtBand[] {
  const court = draftCourt(courts, courtId)
  return court ? courtDayBusy(courts, sessions, court.id, dayKey, ignoreId) : []
}

/** Tappable free gaps on the draft court/day (calendar). */
export function courtGaps(
  sessions: PlaySession[],
  courts: Court[],
  courtId: string | null,
  dayKey: string,
  ignoreId?: string
): CourtBand[] {
  const court = draftCourt(courts, courtId)
  return court ? courtDayGaps(courts, sessions, court.id, dayKey, ignoreId) : []
}

