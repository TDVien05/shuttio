import { createStart } from "@tanstack/react-start"

// Client-side by default: dashboard/auth routes fetch the api from the browser
// with the signed-in user's Clerk token. Only the landing route sets
// `ssr: true` so it can be prerendered to static HTML.
export const startInstance = createStart(() => ({
  defaultSsr: false,
}))
