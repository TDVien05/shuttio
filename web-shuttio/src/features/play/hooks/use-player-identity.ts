import * as React from "react"

import type { Level, SportKey } from "@/lib/shared"
import { useAuthUser } from "@/features/dashboard/hooks/use-auth-user"
import { useData } from "@/features/dashboard/components/data-provider"

/**
 * The signed-in player's editable identity: display name plus the assessed
 * level per sport. Levels come from the dashboard seed's Elo (the
 * React Query cache) — there is no local copy to hydrate after mount.
 */
export function usePlayerIdentity() {
  const authUser = useAuthUser()
  const { user, elo } = useData()
  const userName = authUser.name || user.name
  const userLevels = React.useMemo<Record<SportKey, Level>>(
    () => ({ badminton: elo?.level ?? user.level }),
    [elo, user.level]
  )

  const userLevelForSport = React.useCallback(
    (sport: SportKey): Level => userLevels[sport],
    [userLevels]
  )

  return {
    userName,
    userInitials: user.initials,
    userLevels,
    userLevelForSport,
  }
}
