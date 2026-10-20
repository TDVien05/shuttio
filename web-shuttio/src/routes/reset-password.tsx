import { createFileRoute, redirect } from "@tanstack/react-router"

// Clerk resets passwords with an emailed code on /forgot-password; this old
// link-based route only forwards there.
export const Route = createFileRoute("/reset-password")({
  beforeLoad: () => {
    throw redirect({ to: "/forgot-password", replace: true })
  },
})
