import * as React from "react"
import { useSuspenseQuery } from "@tanstack/react-query"

import { dashboardQueries } from "@/features/dashboard/api/dashboard.queries"
import { useUserLocationContext } from "@/features/dashboard/state/location"
import { distanceKmBetween } from "@/lib/shared/location"

import {
  bookingDays as bookingDaysFn,
  buildRoster,
  conflictFor as conflictForFn,
  courtByVenue as courtByVenueFn,
  courtDayBusy as courtDayBusyFn,
  courtDayPending as courtDayPendingFn,
  courtDayGaps as courtDayGapsFn,
  dayLabelFor as dayLabelForFn,
  isoDateOf,
  playerByInitials as playerByInitialsFn,
} from "@/lib/shared"
import type {
  AccountType,
  Brand,
  Conflict,
  ConflictQuery,
  Court,
  CourtBand,
  Localized,
  Player,
  PlaySession,
  PlayerAssessment,
  RosterEntry,
  User,
  Venue,
  VenuePin,
} from "@/lib/shared"

/**
 * The player-scoped records (fetched from the API) plus helpers pre-bound to
 * them — so call sites keep the original `playerByInitials(initials)` /
 * `courtDayGaps(courtId, day)` signatures even though the records now live in
 * the API rather than a web module.
 *
 * Venue-operator records are **not** here — they are per-venue and provided by
 * the venue bundle queries under each `/app/venue/[venueId]` subtree. The one
 * exception is {@link DataContextValue.venues}, the operator's *list* of venue
 * profiles (account-level, used by the sidebar switcher/manager).
 */
interface DataContextValue {
  // ── Real-time anchor ──
  /** Server "now" as an ISO datetime (+07:00) — the render anchor (never Date.now()). */
  serverNow: string
  /** "YYYY-MM-DD" part of `serverNow`. */
  todayIso: string
  /** Sliding 7-day bookable window anchored on `todayIso`. */
  bookingDays: { key: string; label: Localized }[]
  /** Display label for any ISO date relative to `todayIso` ("Today", "Sat, 18/7", …). */
  dayLabelFor: (dateIso: string) => Localized
  // ── Player records ──
  user: User
  players: Player[]
  courts: Court[]
  /** Every discoverable branch as one map pin (venue coords) for the Find Courts map. */
  venuePins: VenuePin[]
  /** The player's persisted skills assessment (null until taken). */
  assessment: PlayerAssessment | null
  /** The operator's brand (thương hiệu), or null when unprovisioned / player-only. */
  brand: Brand | null
  /** Every branch (chi nhánh) the operator manages (profiles), for the switcher/manager. */
  venues: Venue[]
  /** Effective account type (stored choice ∪ inferred facts). */
  accountType: AccountType | null
  /** The signed-in player's saved contact phone number (absent until set). */
  phone?: string
  // ── Record-bound helpers ──
  playerByInitials: (initials: string) => RosterEntry
  courtByVenue: (name: string) => Court | undefined
  conflictFor: (sessions: PlaySession[], q: ConflictQuery) => Conflict
  courtDayBusy: (
    sessions: PlaySession[],
    courtId: string,
    dayKey: string,
    ignoreId?: string
  ) => CourtBand[]
  courtDayPending: (
    sessions: PlaySession[],
    courtId: string,
    dayKey: string,
    ignoreId?: string
  ) => CourtBand[]
  courtDayGaps: (
    sessions: PlaySession[],
    courtId: string,
    dayKey: string,
    ignoreId?: string
  ) => CourtBand[]
}

const DataContext = React.createContext<DataContextValue | null>(null)

/** Access the player dataset (served by the API) and its bound helpers. */
export function useData() {
  const ctx = React.useContext(DataContext)
  if (!ctx) throw new Error("useData must be used within a DataProvider.")
  return ctx
}

/**
 * Derives the player dataset from the seed query and exposes it — plus helpers
 * bound to it — through `useData`. It owns no mutable copy: a seed refetch
 * (after a write) flows straight through. Geolocation lives in
 * `LocationProvider`; this provider only reads the resulting coordinates to
 * decorate courts with distances.
 */
export function DataProvider({ children }: { children: React.ReactNode }) {
  const { data: seed } = useSuspenseQuery(dashboardQueries.seed())
  const { userLoc } = useUserLocationContext()

  const value = React.useMemo<DataContextValue>(() => {
    const courts = seed.courts.map((court) => ({
      ...court,
      distanceKm: distanceKmBetween(userLoc, court),
    }))
    const roster = buildRoster(seed.user, seed.players)
    const todayIso = isoDateOf(seed.serverNow)
    return {
      // Real-time anchor
      serverNow: seed.serverNow,
      todayIso,
      bookingDays: bookingDaysFn(todayIso),
      dayLabelFor: (dateIso) => dayLabelForFn(dateIso, todayIso),
      // Player records
      user: seed.user,
      players: seed.players,
      courts,
      venuePins: seed.venuePins,
      assessment: seed.assessment,
      // Operator's brand + branch profiles (account-level)
      brand: seed.brand,
      venues: seed.venues,
      accountType: seed.accountType,
      phone: seed.phone,
      // Bound helpers (original signatures preserved)
      playerByInitials: (initials) => playerByInitialsFn(roster, initials),
      courtByVenue: (name) => courtByVenueFn(courts, name),
      conflictFor: (sessions, q) =>
        conflictForFn(courts, seed.user, sessions, q),
      courtDayBusy: (sessions, courtId, dayKey, ignoreId) =>
        courtDayBusyFn(courts, sessions, courtId, dayKey, ignoreId),
      courtDayPending: (sessions, courtId, dayKey, ignoreId) =>
        courtDayPendingFn(sessions, courtId, dayKey, ignoreId),
      courtDayGaps: (sessions, courtId, dayKey, ignoreId) =>
        courtDayGapsFn(courts, sessions, courtId, dayKey, ignoreId),
    }
  }, [seed, userLoc])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
