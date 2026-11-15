import { MAPBOX_TOKEN } from "@/lib/env"

/** One place the host can pick for a self-booked court. */
export interface PlaceHit {
  id: string
  /** The place's own name (a venue's name for a POI). */
  name: string
  /** Street address with ward and city, ready for the address field. */
  address: string
  /** Ward/district for the room's public "area" line. */
  ward: string
  lat: number
  lng: number
  /** `poi` for a named venue, else an address/street/area. */
  kind: string
}

interface SearchBoxFeature {
  properties: {
    mapbox_id: string
    feature_type: string
    name: string
    address?: string
    full_address?: string
    place_formatted?: string
    coordinates: { latitude: number; longitude: number }
    context?: Record<string, { name?: string } | undefined>
  }
}

/** Searching only makes sense with a Mapbox token (the same one the maps use). */
export const placeSearchEnabled = Boolean(MAPBOX_TOKEN)

/**
 * Search venues and addresses in Vietnam with Mapbox's Search Box API — it
 * knows venues by name ("Sân cầu lông Kỳ Hoà") far better than the plain
 * geocoder, which misplaces Vietnamese street addresses. Results are biased
 * toward `near` (the current pin, else Ho Chi Minh City).
 */
export async function searchPlaces(
  query: string,
  near: { lat: number; lng: number },
  signal?: AbortSignal
): Promise<PlaceHit[]> {
  if (!MAPBOX_TOKEN) return []
  const url = new URL("https://api.mapbox.com/search/searchbox/v1/forward")
  url.search = new URLSearchParams({
    q: query,
    country: "vn",
    language: "vi",
    limit: "5",
    proximity: `${near.lng},${near.lat}`,
    access_token: MAPBOX_TOKEN,
  }).toString()
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Place search failed (${res.status})`)
  const body = (await res.json()) as { features?: SearchBoxFeature[] }
  return (body.features ?? []).map(toHit)
}

function toHit(f: SearchBoxFeature): PlaceHit {
  const p = f.properties
  const ctx = p.context ?? {}
  const ward =
    ctx.neighborhood?.name ??
    ctx.locality?.name ??
    ctx.district?.name ??
    ctx.place?.name ??
    ""
  const street = p.address ?? (p.feature_type === "poi" ? "" : p.name)
  const address = [street, ctx.neighborhood?.name, ctx.place?.name]
    .filter((part): part is string => Boolean(part))
    .join(", ")
  return {
    id: p.mapbox_id,
    name: p.name,
    address: address || p.full_address || p.place_formatted || p.name,
    ward,
    lat: p.coordinates.latitude,
    lng: p.coordinates.longitude,
    kind: p.feature_type,
  }
}
