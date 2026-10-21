import { Centrifuge, UnauthorizedError } from "centrifuge"
import type { Subscription } from "centrifuge"

import { api } from "@/lib/api"
import { ApiError } from "@/lib/api-error"
import { CENTRIFUGO_URL } from "@/lib/env"

// Channel names mirror api/src/features/realtime/channels.ts.
export const ROOMS_CHANGES_CHANNEL = "rooms:changes"
export const userSessionsChannel = (userId: string) =>
  `personal:sessions#${userId}`
export const userNotificationsChannel = (userId: string) =>
  `personal:notifications#${userId}`
export const userChatChannel = (userId: string) => `personal:chat#${userId}`

let client: Centrifuge | null = null

/**
 * One shared connection; the api mints (and re-mints) its short-lived JWT from
 * the signed-in Clerk session. A 401/403 means the session is gone, so throw
 * `UnauthorizedError` — the SDK then stops refreshing instead of retrying
 * forever; any other failure (network, 5xx) is retried by the SDK.
 */
function getClient(): Centrifuge {
  if (!client) {
    client = new Centrifuge(CENTRIFUGO_URL, {
      getToken: async () => {
        try {
          return (
            await api<{ token: string }>("/api/realtime/token", {
              method: "POST",
            })
          ).token
        } catch (err) {
          if (err instanceof ApiError && [401, 403].includes(err.status)) {
            throw new UnauthorizedError("Signed out")
          }
          throw err
        }
      },
    })
    client.connect()
  }
  return client
}

const subscribers = new Map<string, number>()

/**
 * Call `onPublication` for every message published to `channel`. Subscribers
 * to the same channel share one Centrifugo subscription. Browser-only — call
 * from an effect. `onSubscribed` fires each time this client's subscription
 * (re)establishes after a reconnect — refetch there to cover anything missed
 * while offline. Returns the unsubscribe function.
 */
export function subscribeToChannel(
  channel: string,
  onPublication: (data: unknown) => void,
  onSubscribed?: () => void
): () => void {
  const c = getClient()
  const sub: Subscription =
    c.getSubscription(channel) ?? c.newSubscription(channel)
  const handler = (ctx: { data: unknown }) => onPublication(ctx.data)
  sub.on("publication", handler)
  if (onSubscribed) sub.on("subscribed", onSubscribed)
  subscribers.set(channel, (subscribers.get(channel) ?? 0) + 1)
  sub.subscribe()

  return () => {
    sub.removeListener("publication", handler)
    if (onSubscribed) sub.removeListener("subscribed", onSubscribed)
    const left = (subscribers.get(channel) ?? 1) - 1
    if (left > 0) {
      subscribers.set(channel, left)
      return
    }
    subscribers.delete(channel)
    sub.unsubscribe()
    c.removeSubscription(sub)
    // Nobody is listening any more (e.g. the user signed out): close the
    // connection so the next sign-in connects as itself, not the last user.
    if (subscribers.size === 0) {
      c.disconnect()
      client = null
    }
  }
}
