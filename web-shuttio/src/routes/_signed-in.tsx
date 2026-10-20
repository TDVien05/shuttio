import { Navigate, Outlet, createFileRoute } from "@tanstack/react-router"
import { useAuth } from "@clerk/react"

import { RouteLoading } from "@/components/route-loading"

/** Every route below needs a signed-in user; others go to sign-in. */
export const Route = createFileRoute("/_signed-in")({
  component: SignedInLayout,
})

function SignedInLayout() {
  const { isLoaded, isSignedIn } = useAuth()

  if (!isLoaded) return <RouteLoading />
  if (!isSignedIn) return <Navigate to="/sign-in" replace />
  return <Outlet />
}
