import { Outlet, createFileRoute } from "@tanstack/react-router"

// Replaced in the admin phase.
export const Route = createFileRoute("/_signed-in/app/admin")({
  component: Outlet,
})
