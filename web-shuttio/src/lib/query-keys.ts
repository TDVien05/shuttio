/**
 * One factory for every React Query key. Keeping keys here (instead of raw
 * arrays at each call site) makes targeted invalidation reviewable and avoids
 * collisions such as `["venue", "mine"]` vs. `["venue", venueId]`.
 */
export const queryKeys = {
  seed: () => ["seed"] as const,

  sessions: () => ["sessions"] as const,
  rooms: () => ["rooms"] as const,
  notifications: () => ["notifications"] as const,

  elo: {
    questionnaire: () => ["elo", "questionnaire"] as const,
    result: () => ["elo", "result"] as const,
    level: (userId: string) => ["elo", "level", userId] as const,
  },
  ratings: (userId: string) => ["ratings", userId] as const,

  venue: {
    all: () => ["venue"] as const,
    detail: (id: string) => ["venue", "detail", id] as const,
    mine: () => ["venue", "mine"] as const,
    branches: () => ["venue", "branches"] as const,
    payout: () => ["venue", "payout"] as const,
  },

  admin: {
    all: () => ["admin"] as const,
    overview: () => ["admin", "overview"] as const,
    venues: () => ["admin", "venues"] as const,
    bookings: () => ["admin", "bookings"] as const,
    refunds: () => ["admin", "refunds"] as const,
    complaints: () => ["admin", "complaints"] as const,
    approvals: () => ["admin", "approvals"] as const,
    discounts: () => ["admin", "discounts"] as const,
    appReviews: () => ["admin", "app-reviews"] as const,
  },

  appReviews: () => ["app-reviews"] as const,
  appReviewsPublic: () => ["app-reviews", "public"] as const,
  appReviewMe: () => ["app-reviews", "me"] as const,

  banks: () => ["banks"] as const,
  account: () => ["account"] as const,

  chat: {
    all: () => ["chat"] as const,
    channels: (venueId?: string) =>
      ["chat", "channels", venueId ?? null] as const,
    channelsAll: () => ["chat", "channels"] as const,
    messages: (channelId: string) => ["chat", "messages", channelId] as const,
    messagesAll: () => ["chat", "messages"] as const,
    users: (query: string) => ["chat", "users", query] as const,
  },
} as const
