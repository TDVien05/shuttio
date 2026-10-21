// Centrifugo channel names. Must match the namespaces in
// `centrifugo/config.json` (`rooms`, `personal`) and the web's
// `web-shuttio/src/lib/realtime.ts`.

/** Every client: "a room was created, changed or removed" (`{ roomId }`). */
export const ROOMS_CHANGES_CHANNEL = "rooms:changes"

/** User-limited (`#<userId>`): Centrifugo only lets that user subscribe. */
export const userSessionsChannel = (userId: string) =>
  `personal:sessions#${userId}`

/** User-limited: a new notification row exists for the user. */
export const userNotificationsChannel = (userId: string) =>
  `personal:notifications#${userId}`

/** User-limited: chat messages and channel-list changes for that user. */
export const userChatChannel = (userId: string) => `personal:chat#${userId}`
