import { createFileRoute } from "@tanstack/react-router"
import { AuthenticateWithRedirectCallback } from "@clerk/react"

export const Route = createFileRoute("/sso-callback")({
  component: SSOCallbackPage,
})

function SSOCallbackPage() {
  return (
    <div className="flex min-h-40 items-center justify-center">
      <span className="text-sm text-muted-foreground">…</span>
      <AuthenticateWithRedirectCallback
        signInForceRedirectUrl="/app"
        signUpForceRedirectUrl="/app"
      />
    </div>
  )
}
