import type { Level, SportKey } from "@/lib/shared"

/** A court hold or join-request/invite that auto-expired — for notifications. */
export interface ExpiredEvent {
  id: string
  kind: "hold" | "request" | "invite"
  title: string
  /** Venue for a lapsed hold; the player's name for an expired RSVP. */
  description?: string
}

/** Constraints the Quick Join popover applies to the auto-pick. */
export interface QuickJoinFilters {
  sport: SportKey | "all"
  courtId: string | null
  maxDistanceKm: number | null
  day: "today" | "today-tomorrow"
  format: "Singles" | "Doubles" | "any"
  level: "my" | "any" | Level
}
