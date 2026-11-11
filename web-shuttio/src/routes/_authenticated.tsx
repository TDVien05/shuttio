import {
  Navigate,
  Outlet,
  createFileRoute,
  useLocation,
} from "@tanstack/react-router"
import { useAuth, useUser } from "@clerk/react"

import { RouteLoading } from "@/components/layouts/route-loading"

/** Every route below needs a signed-in user; others go to sign-in. */
export const Route = createFileRoute("/_authenticated")({
  component: SignedInLayout,
})

function SignedInLayout() {
  const { isLoaded, isSignedIn } = useAuth()
  const { user } = useUser()
  const pathname = useLocation({ select: (l) => l.pathname })

  if (!isLoaded) return <RouteLoading />
  if (!isSignedIn) return <Navigate to="/sign-in" replace />
  // Admin-provisioned accounts must replace the emailed temporary password
  // before reaching anything else.
  if (
    user?.publicMetadata.mustChangePassword === true &&
    pathname !== "/change-password"
  ) {
    return <Navigate to="/change-password" replace />
  }
  return <Outlet />
}
