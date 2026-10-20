import { ClerkProvider as BaseClerkProvider } from "@clerk/react"
import { viVN } from "@clerk/localizations"
import { useRouter } from "@tanstack/react-router"

import { CLERK_PUBLISHABLE_KEY } from "@/lib/env"

/**
 * Clerk wired to the TanStack router. Lazy-loaded by the root route for every
 * page except the landing, which never touches auth — so `/` doesn't ship the
 * Clerk SDK.
 */
export default function ClerkProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()

  return (
    <BaseClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      localization={viVN}
      routerPush={(to) => router.navigate({ href: to })}
      routerReplace={(to) => router.navigate({ href: to, replace: true })}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/app"
      signUpFallbackRedirectUrl="/app"
      afterSignOutUrl="/"
    >
      {children}
    </BaseClerkProvider>
  )
}
