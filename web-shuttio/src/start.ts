import { createStart } from "@tanstack/react-start"

// SSR is enabled by default so the landing page can be prerendered. The root
// route's `ssr` gate (`src/routes/__root.tsx`) opts every non-landing path out,
// keeping auth/dashboard routes client-side. A client-only default here would
// also make the landing client-only: child routes inherit a false `ssr` from
// the root and cannot opt back in with a route-level `ssr: true`.
export const startInstance = createStart(() => ({}))
