import { useData } from "./data-provider"
import { m } from "@/paraglide/messages"

/** Always resolve distance for this viewer, never a room host's saved distance. */
export function CourtDistance({
  courtId,
  venue,
}: {
  courtId?: string | null
  venue?: string
}) {
  const { courts } = useData()
  const court = courts.find((c) =>
    courtId ? c.id === courtId : c.name === venue
  )
  return court?.distanceKm != null
    ? m.shared_distance({ km: court.distanceKm })
    : m.shared_distance_unknown()
}
