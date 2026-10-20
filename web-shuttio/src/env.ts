// Browser-facing configuration, inlined by Vite at build time. Only `VITE_*`
// variables reach the client bundle — never put secrets here.

/** Origin of the NestJS api, reachable from the user's browser. */
export const API_URL: string =
  import.meta.env.VITE_API_URL ?? "http://localhost:6969"

/** Clerk publishable key (pk_…). */
export const CLERK_PUBLISHABLE_KEY: string =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? ""

/** Mapbox token for the Find Courts map; the map shows a fallback without it. */
export const MAPBOX_TOKEN: string | undefined =
  import.meta.env.VITE_MAPBOX_TOKEN || undefined
