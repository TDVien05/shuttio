import { useUser } from "@clerk/react"

/** The signed-in user, normalized to the minimal shape the dashboard needs. */
export type AuthUser = {
  id: string
  name: string
  email: string
  image?: string | null
  /**
   * RBAC (https://clerk.com/docs/guides/secure/basic-rbac): granted purely in
   * the Clerk dashboard (`publicMetadata.role`), never by app code. `null` for
   * every ordinary player/venue-operator account.
   */
  role: "admin" | null
}

/**
 * The signed-in Clerk user. Only call inside the `/app` layout, which renders
 * nothing until Clerk has loaded a signed-in user.
 */
export function useAuthUser(): AuthUser {
  const { user } = useUser()
  if (!user) throw new Error("useAuthUser must be used inside the dashboard")
  const email =
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses.at(0)?.emailAddress ??
    ""
  return {
    id: user.id,
    name: user.fullName || user.firstName || user.username || email,
    email,
    image: user.imageUrl,
    role: user.publicMetadata.role ?? null,
  }
}
