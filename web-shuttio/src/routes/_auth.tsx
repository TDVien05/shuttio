import { Navigate, Outlet, createFileRoute } from "@tanstack/react-router"
import { useAuth } from "@clerk/react"

import { Logo } from "@/components/logo"

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
})

function AuthLayout() {
  const { isLoaded, isSignedIn } = useAuth()

  // Already signed in? Skip the auth pages entirely.
  if (isLoaded && isSignedIn) return <Navigate to="/app" replace />

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex justify-center">
          <Logo />
        </div>
        <Outlet />
      </div>
    </div>
  )
}
