import { queryKeys } from "@/lib/query-keys"
import {
  ROOMS_CHANGES_CHANNEL,
  useChannelInvalidation,
  userNotificationsChannel,
  userSessionsChannel,
} from "@/lib/realtime"
import { useAuthUser } from "@/features/dashboard/hooks/use-auth-user"

/**
 * Turns the api's live room/session publications into query invalidations.
 * Polling in `sessionQueries`/`notificationQueries` stays the offline fallback.
 */
export function SessionRealtime({
  playerWorkspace,
}: {
  /** Session/room channels only matter in the player surface. */
  playerWorkspace: boolean
}) {
  const authUser = useAuthUser()

  useChannelInvalidation(playerWorkspace ? ROOMS_CHANGES_CHANNEL : null, [
    // A join request lands on the *host's* session doc, while the signal
    // goes out on the global room channel — refresh both projections.
    queryKeys.sessions(),
    queryKeys.rooms(),
    queryKeys.notifications(),
  ])
  useChannelInvalidation(
    playerWorkspace ? userSessionsChannel(authUser.id) : null,
    [queryKeys.sessions()]
  )
  // Notifications also drive the operator/admin bell.
  useChannelInvalidation(userNotificationsChannel(authUser.id), [
    queryKeys.notifications(),
  ])

  return null
}
