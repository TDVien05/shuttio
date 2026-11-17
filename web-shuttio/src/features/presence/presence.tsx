import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"
import { relativeTime } from "@/lib/relative-time"
import type { UserPresenceStatus } from "@/lib/shared"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

/** Mirrors the api's cap (`PRESENCE_MAX_USERS`). */
const MAX_USERS = 50
/** How often the presence of people on screen is re-read. */
const REFRESH_MS = 30_000

/**
 * Presence of the given users, keyed by user id — who has the app open right
 * now and when the others were last active. Re-read every 30 seconds while
 * `enabled` (pass the dialog's/list's visibility so hidden UI doesn't poll).
 * An id missing from the map is simply unknown: render nothing for it.
 */
export function usePresence(
  userIds: readonly string[],
  enabled = true
): Map<string, UserPresenceStatus> {
  // Sorted + deduplicated so the same set of people shares one cache entry
  // whatever order the caller lists them in.
  const ids = [...new Set(userIds)].sort().slice(0, MAX_USERS)
  const { data } = useQuery({
    queryKey: queryKeys.presence(ids),
    queryFn: ({ signal }) =>
      api<UserPresenceStatus[]>("/api/realtime/presence", {
        method: "POST",
        body: { userIds: ids },
        signal,
      }),
    enabled: enabled && ids.length > 0,
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS / 2,
  })
  return new Map((data ?? []).map((status) => [status.userId, status]))
}

/** "Đang hoạt động" / "Hoạt động 5 phút trước"; null when nothing is known. */
export function presenceText(
  status: UserPresenceStatus | undefined
): string | null {
  if (!status) return null
  if (status.online) return m.presence_online()
  if (!status.lastSeenAt) return null
  return m.presence_last_seen({
    when: relativeTime(new Date(status.lastSeenAt)),
  })
}

/**
 * The green "online" dot, positioned on the bottom-right of an avatar — wrap
 * the avatar in a `relative` element. Renders nothing unless the user is
 * online; the dot is decorative, so pair it with `presenceText` (or a title)
 * wherever the state must be readable without colour.
 */
export function PresenceDot({
  status,
  className,
}: {
  status: UserPresenceStatus | undefined
  className?: string
}) {
  if (!status?.online) return null
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-popover bg-brand",
        className
      )}
    />
  )
}
