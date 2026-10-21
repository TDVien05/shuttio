# State Refactor Plan — React Query for server state, Context for UI

- **Status:** proposal
- **Scope:** `web-shuttio/` (TanStack Start + React Query)
- **Date:** 2026-10-21
- **Related:** `MIGRATION.md`

> Line numbers are from the current migration branch and may drift as the
> migration continues. All paths are relative to `web-shuttio/` unless stated
> otherwise.

> **Review (2026-10-21).** I checked this plan against the code. The direction
> is right and most findings hold up: the session/venue state mirrors, the
> dead `VenueProvider` surface, the global `invalidateQueries()` calls and the
> geolocation prompt on every `/app` visit are all real. Corrections made
> inline:
>
> 1. **The SSE P0 was stale.** Realtime is Centrifugo (`src/lib/realtime.ts`);
>    `src/lib/events.ts` no longer exists. I rewrote §5 and §6.6 around
>    `subscribeToChannel` + reconnect catch-up, and downgraded the finding to
>    P1.
> 2. **The notifications sketch had a bug:** a per-hook `readLocal` diverges
>    between the bell and the toaster (§6.9).
> 3. **Deleting `DataProvider` costs more than it saves:** per-consumer
>    `useMemo` repeats the projections. Keep it as a derived provider (§6.8).
> 4. **The biggest Phase 2 risk was understated:** a refetch can wipe an
>    optimistic `forming` room before `saveSession` lands. Explicit steps
>    added.
> 5. **Phase 0 must not add an ESLint rule:** `eslint.config.js` is
>    off-limits. Use a CI grep instead.
> 6. The query-client factory is low value while only `/` is SSR; the test
>    harness (jsdom/RTL/msw) is missing; Phase 2 effort is raised to 5–8 days.
>
> **Booking wizard and expiry sweep:** now planned in §13 as a Phase 1.5
> that lands before Phase 2. It found that request/invite expiry exists
> only in the client and needs an API rule.

---

## 1. Executive summary

The app already uses React Query for its initial reads, but most server records
still pass through Context and several providers keep **hand-rolled copies** of
those records in local state.

The main issues:

1. **`SessionProvider`** is a second cache for `sessions` and `crossRooms`,
   complete with manual polling, hand-wired Centrifugo refetches, and merge logic.
2. **`VenueDataProvider`** copies reservations, customers, and blocks out of a
   React Query result into `useState`, then mutates and polls those copies.
3. **`DataProvider`** re-provides the already-cached seed through Context and
   exposes several unused fields.
4. **`VenueProvider`** is mostly dead code; only its local copy of `stats` is
   consumed.
5. **Realtime is wired outside React Query.** `SessionProvider` and
   `NotificationsProvider` subscribe to Centrifugo (`src/lib/realtime.ts`)
   and refetch into local state, then signal each other through a
   `window` event (`ROOMS_CHANGED_EVENT`). The venue workspace has no
   realtime channel at all and polls the full bundle.
6. Query keys are scattered, several writes call `invalidateQueries()` with no
   key, and API modules import a module-level `QueryClient` singleton.

The target model:

- **React Query owns every record with an API endpoint**: seed, sessions,
  rooms, venue bundle/reservations/customers/blocks, notifications,
  assessment, admin rows, banks.
- **Context owns only UI/browser state**: open dialogs, active room id, booking
  draft, geolocation, client-only expiry items.
- Providers may **derive** values from query data for convenience, but must not
  copy query data into `useState`, poll it separately, or merge it manually.

The recommended first slice is the **venue workspace**. It is self-contained,
removes two providers, and fixes a real staleness bug before the larger player
session refactor.

---

## 2. Goals and non-goals

### Goals

- Make React Query the single source of truth for server data.
- Reduce Context to UI state and shared hooks.
- Remove manual polling/realtime/merge code that duplicates React Query behavior.
- Route Centrifugo events through query invalidation and fix the stale venue data mirrors.
- Centralize query keys and make cache invalidation targeted.
- Make state logic testable through pure derive functions and query/mutation
  tests.
- Avoid changing the user-facing behavior or Vietnamese copy.

### Non-goals

- Redesigning the UI or the API surface.
- Removing Context from third-party UI primitives (sidebar, progress, combobox,
  etc.).
- Touching the old `web/` Next.js app before the port is complete and deletion
  is approved.
- Moving every piece of local component state into React Query. Dialogs,
  drafts, selections, and browser state stay local/context.

---

## 3. Decision rules

| Belongs in React Query              | Belongs in Context                      |
| ----------------------------------- | --------------------------------------- |
| Anything loaded from `/api/*`       | Dialog open/closed                      |
| Anything persisted in MongoDB       | Active room/session id                  |
| Lists that need polling or realtime | Booking wizard draft/step               |
| Data shared across routes           | UI preferences backed by `localStorage` |
| Mutations and optimistic updates    | Geolocation / browser APIs              |
| Server-derived aggregates           | Client-only expiry notifications        |
| Per-user profile / assessment       | Hover, filter, sort, pagination         |

**Rule of thumb:** if the data has an endpoint, React Query owns it. If it
disappears on reload and has no endpoint, Context or local state owns it.

**Provider rule:** a provider may derive values from query data for performance,
but it must not fetch, hold a second mutable copy, or reconcile server
snapshots. Prefer deleting the provider and exposing a hook.

---

## 4. Current state

### 4.1 Context map

| Context                       | What it holds today                                            | Where it comes from                                                    | Verdict                                                        |
| ----------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| `DataProvider`                | seed records, bound helpers, geolocation                       | Already-fetched React Query seed passed as a prop                      | Re-provides query data through context. Split.                 |
| `SessionProvider`             | `sessions`, `crossRooms`, assessment levels, 20+ UI fields     | `seed.sessions`, `GET /api/sessions`, `GET /api/rooms`, `localStorage` | A second cache with manual polling/merging. Split.             |
| `VenueDataProvider`           | reservations, customers, blocks, bundle + schedule projections | React Query bundle prop, then `useState`; polls the whole bundle       | A second cache with stale copies. Replace.                     |
| `VenueProvider`               | stats, pricing suggestions, applied/dismissed ids              | Local copy of `venueStats`                                             | Mostly dead code. Delete.                                      |
| `NotificationsProvider`       | notification list, read state, toasts                          | React Query query                                                      | Data should come from a hook; context only for local UI state. |
| Sidebar / progress / combobox | UI                                                             | —                                                                      | Correct usage. Keep.                                           |

### 4.2 Provider chain

```text
routes/_authenticated/app/route.tsx
└── DataProvider                     // seed via props
    └── SessionProvider              // sessions + rooms + UI
        └── NotificationsProvider    // notifications query + UI
            └── PlayerAssessmentGate
                ├── DashboardFrame
                └── PlayerChrome

routes/_authenticated/app/venue/$venueId/route.tsx
└── VenueDataProvider                // bundle via props + local copies
    └── VenueWorkspaceProvider       // local stats + pricing UI
        └── Outlet
```

### 4.3 What is already good

- `admin.queries.ts`, `venue.queries.ts`, `onboarding.queries.ts`, and
  `app-review.queries.ts` follow the `queryOptions` pattern.
- Route guards use `fetchForGuard` cleanly.
- The QueryClient retry policy correctly avoids retrying 4xx errors.
- The landing page fetches public reviews in the browser without blocking the
  prerender.
- Pure helper modules already have some unit tests (`helpers.test.ts`,
  `player-assessment.test.ts`, `location.test.ts`).

---

## 5. Findings

### P0 — `SessionProvider` is a second server cache

File: `src/features/play/components/session.tsx`

- `sessions` is initialized from `seed.sessions` with `useState` (`:403`).
- `crossRooms` is separate local state (`:416`) fetched by a hand-written rooms
  poll (`:555–602`).
- A second poll hits `GET /api/sessions` every 30s (`:607–646`).
- Manual reconciliation exists in three places:
  - seed reconcile effect (`:453–496`)
  - `applyServerSessions` (`:95–136`)
  - `mergeIncomingRequests` (`:514–536`)
- Every write is a local `setSessions` plus fire-and-forget `persist()`
  (`:667–685`). If the API write fails, the UI never knows.
- `SessionProvider` is mounted at the `/app` layout
  (`src/routes/_authenticated/app/route.tsx:40`), so admin and venue pages also
  run both polls and both Centrifugo subscriptions even though they do not use
  matchmaking.
- Assessment levels are a fourth copy of assessment state (`:423–425`,
  `:731–747`).

This duplicates cache, stale time, polling, focus refetch, deduplication,
rollback, and devtools visibility that React Query already provides.

### P1 — Realtime bypasses the query cache

> **Corrected in review.** An earlier draft reported that raw `EventSource`
> SSE was broken. That code is gone: `src/lib/events.ts` no longer exists and
> realtime now runs on **Centrifugo** (`src/lib/realtime.ts`,
> `subscribeToChannel`). Live updates work today.

File: `src/features/play/components/session.tsx:560–642`,
`src/features/dashboard/components/notifications.tsx:82–100`

- `rooms:changes` and `personal:sessions#<userId>` publications trigger a
  250 ms-debounced hand-written refetch into `useState`, on top of a
  `setInterval` poll and focus/visibility listeners. All of that duplicates
  `invalidateQueries` + `refetchInterval` + `refetchOnWindowFocus`.
- After a room event, `session.tsx` dispatches `ROOMS_CHANGED_EVENT` so the
  notification provider can refetch: two providers coupled through `window`.
- `subscribeToChannel` takes an `onSubscribed` callback for refetching after
  a reconnect, but neither caller passes it. Updates missed while offline only
  show up on the next poll.
- The venue workspace has no channel. Reservation changes reach the operator
  only through the 10 s full-bundle poll.

### P0 — `VenueDataProvider` mirrors React Query data in local state

File: `src/features/venue/components/venue-data-provider.tsx`

- `reservations`, `customers`, and `blocks` are copied from the `seed` prop
  into `useState` once (`:140–146`).
- A 10s effect calls `fetchVenueReservations()` (`:152–181`), which internally
  fetches the **entire venue bundle** just to extract reservations
  (`src/features/venue/api/venue-api.ts:82–87`).
- `addBlock`, `removeBlock`, `addCustomer`, `updateReservation`, and
  `addReservation` (`:183–251`) mutate only the local copies.
- The provider ignores subsequent `seed` prop updates because `useState`
  initial values run only on mount. So `customers` and `blocks` never resync
  with a refetched bundle, and reservations resync only through the separate
  poll.
- The API modules also call `invalidateQueries({ queryKey: ["venue", venueId] })`,
  which refetches the bundle. Two independent reconciliation paths now exist.

Result: customer and block data can drift from the server; a branch remount can
show a different customer aggregate than the local overlay; and adding a
reservation both updates the local list and triggers a full-bundle refetch.

### P1 — `VenueProvider` is mostly dead code

File: `src/features/venue/components/venue-provider.tsx`

- It copies `venueStats` into local state (`:39`) and lets `applyInsight` nudge
  those KPIs locally (`:47–65`).
- Search shows only `stats` is consumed:
  - `src/features/venue/components/command.tsx:43`
  - `src/features/venue/components/schedule.tsx:148`
- `priceSuggestions`, `applyInsight`, `dismissInsight`, `appliedIds`,
  `dismissedIds`, and `appliedCount` have **no call sites**.
- The “AI pricing apply” flow is therefore unfinished/dead code that still
  creates a provider and a local stats fork.

Use `venueStats` directly from the venue query. If pricing suggestions are
planned, keep only their UI state in a small provider/store and persist the
decision through a mutation.

### P1 — `DataProvider` re-provides query data and exposes dead fields

File: `src/features/dashboard/components/data-provider.tsx`

- It receives `seed` from `useSuspenseQuery` in the route and re-exposes it
  through context (`:134–192`).
- Consumers cannot subscribe narrowly; any seed change re-renders every
  `useData()` consumer.
- Several exposed fields are never consumed in `web-shuttio`:
  - `rooms`, `bookings`, `notifications`, `stats`, `activity`, `streak` are only
    copied in `:163–169`.
  - `sessions` is consumed only by `SessionProvider`.
  - `seed.venue` and `seed.activeVenueId` are never used at all in this app.
- It also owns `useUserLocation()` (`:141`), so every `/app` visit — including
  admin and venue workspaces — triggers a geolocation prompt.

`useData()` is a useful facade; it should become a hook over the seed query plus
a small `LocationProvider`, not a context that owns data.

### P1 — Query-key and invalidation hygiene

- No centralized key factory. Keys are raw arrays scattered across files:
  `["seed"]`, `["venue", venueId]`, `["venue", "mine"]`,
  `["app-reviews", "me"]`, `["banks"]`, `["notifications"]`,
  `["ratings", userId]`, `["assessment", "levels", userId]`.
- Several writes invalidate **everything**:
  - `src/features/venue/api/venue-api.ts:106,153,197,209,221,230`
  - `src/features/booking/components/payment-screen.tsx:279`
  - `src/features/venue/components/payment-review.tsx`
- `src/features/booking/components/bookings.tsx:393–395` invalidates
  `["seed"]` on every mount, even when the cache is fresh.
- Inline `useQuery` definitions exist in:
  - `src/features/dashboard/components/profile-dialog.tsx:321–325`
  - `src/features/app-review/components/app-review-dialog.tsx:67–72`
  - `src/features/venue/components/payout-fields.tsx:45–49`
- The QueryClient is a module-level singleton
  (`src/lib/query-client.ts:9`) imported directly by API modules. Today only
  `/` is SSR, so this is not a production data leak, but it is a latent
  SSR/test hazard: a per-request client is the TanStack pattern, and API modules
  importing a global client make mutation logic hard to test.

### P1 — Notification context mixes data and UI state

File: `src/features/dashboard/components/notifications.tsx`

- The server list is already a React Query query (`:72–77`), then wrapped in
  context with derived `items` and `unreadCount`.
- `readLocal` (`:79`) is legitimate UI state for client-only expiry items, but
  the whole provider re-renders on every poll.
- `markRead` and `markAllRead` optimistically update the cache and then swallow
  server errors (`:130–139`). A `useMutation` with rollback would be more
  correct.
- The `ROOMS_CHANGED_EVENT` window event (`:82–87`) is a workaround for missing
  query invalidation.

The data can stay in React Query; a provider is only needed if the read-local
set must survive route changes.

### P2 — Assessment state has four sources

- Server value: `seed.assessment`
- localStorage cache: `readStoredAssessment()` / `writeStoredAssessment()`
- `SessionProvider` state: `assessmentLevels` (`session.tsx:423–425`), synced via
  `storage` and `PLAYER_ASSESSMENT_UPDATED_EVENT` (`:731–747`)
- Gate state: `ready` + `hasAssessment` + effects
  (`src/features/assessment/components/player-assessment-gate.tsx:77–105`)

Store the assessment in React Query, use localStorage only as
`initialData`/optimistic cache for the synchronous readers, and have one
mutation update both. The gate can then be `useQuery` + `Navigate`.

### P2 — `/api/seed` carries duplicated data

Files: `src/lib/shared/types.ts:1236–1261`,
`api/src/features/seed/seed.service.ts`

The seed payload includes:

- `sessions`, which is exactly `GET /api/sessions`
- `venue` — the full operator bundle, never consumed by `web-shuttio`
- `activeVenueId` — never consumed by `web-shuttio`
- `rooms`, `bookings`, `notifications`, `stats`, `activity`, `streak` — never
  consumed by `web-shuttio`

The API builds the venue bundle on every seed request. After the old `web/` app
is deleted, trim these fields or introduce a slim player-bootstrap endpoint.
Until then, leave the shared `Seed` shape alone to avoid breaking `web/`.

### P2 — Dead surface in the session facade

- `setUserName` has no consumers; `userName` can come from `useAuthUser()`.
- `setUserLevel` has no consumers; levels come from the assessment query.
- `useOptionalVenueData()` has no consumers.
- `useMatchmaking()` re-exports nearly the entire session store, including dead
  fields.

Removing this surface reduces re-renders and makes the refactor smaller.

---

## 6. Target architecture

### 6.1 Layout

```text
src/
  lib/
    query-keys.ts         # query-key factory (one file, no folder)
    query-client.ts       # unchanged singleton (see §6.3)
    realtime.ts           # + useChannelInvalidation() next to subscribeToChannel
  features/
    play/
      api/
        session.queries.ts   # sessions + rooms: queryOptions AND mutation hooks
      lib/
        matchmaking-derive.ts  # pure derive functions (testable)
      components/
        session.tsx       # shrinks to the UI-only provider + useSessionData()
    booking/
      components/
        booking-draft.tsx # wizard UI state (§13.1)
    venue/
      api/
        venue.queries.ts  # bundle query AND mutation hooks
      components/
        venue-data.ts     # useVenueData(): derived projections, no provider
```

> **Simplification rule (§14):** one `*.queries.ts` per feature holds its
> queries and mutations; no `state/`/`hooks/` folders for a single file; no
> facade hooks in the end state.

### 6.2 Query keys

```ts
// src/lib/query/keys.ts
export const queryKeys = {
  seed: () => ["seed"] as const,
  sessions: () => ["sessions"] as const,
  rooms: () => ["rooms"] as const,
  notifications: () => ["notifications"] as const,
  assessment: () => ["assessment"] as const,
  assessmentLevels: (userId: string) =>
    ["assessment", "levels", userId] as const,
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
    // ...
  },

  appReviews: () => ["app-reviews"] as const,
  appReviewMe: () => ["app-reviews", "me"] as const,
  appReviewsPublic: () => ["app-reviews", "public"] as const,
  banks: () => ["banks"] as const,
}
```

Using `detail` as a segment also removes the accidental `["venue", "mine"]` /
`["venue", id]` collision risk.

### 6.3 Query client

Replace the module singleton with a browser singleton + per-request server
client:

```ts
// src/lib/query/query-client.ts
let browserQueryClient: QueryClient | undefined

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status < 500) &&
          failureCount < 2,
      },
    },
  })
}

export function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient()
  browserQueryClient ??= makeQueryClient()
  return browserQueryClient
}

export function getContext() {
  return { queryClient: getQueryClient() }
}
```

API modules should stop importing the singleton and instead be wrapped by
mutation hooks that use `useQueryClient()`. Until that migration is complete,
the singleton can remain as a compatibility bridge.

> **Review (revised): follow the official TanStack Start setup.**
> `src/router.tsx` already builds its context per `getRouter()` call and wires
> `setupRouterSsrQueryIntegration`; the client is the only module-level piece.
> The documented pattern is to create the `QueryClient` **inside**
> `getRouter()`. That is a small change, not the two-function factory sketched
> above:
>
> ```ts
> // src/router.tsx
> export function getRouter() {
>   const queryClient = createQueryClient() // same defaults as today
>   const router = createTanStackRouter({ routeTree, context: { queryClient }, ... })
>   setupRouterSsrQueryIntegration({ router, queryClient })
>   return router
> }
> ```
>
> The blocker is API modules importing the singleton (`venue-api.ts` and
> others). So the order is: move their invalidations into mutation hooks
> (`useQueryClient()`) during Phases 1–2, then switch `router.tsx` in Phase 5
> and delete the exported `queryClient`. Track "modules importing
> `@/lib/query-client`" as a §14.4 metric.

### 6.4 Session queries and mutations

```ts
// src/features/play/api/session.queries.ts
export const sessionQueries = {
  mine: () =>
    queryOptions({
      queryKey: queryKeys.sessions(),
      queryFn: ({ signal }) => api<PlaySession[]>("/api/sessions", { signal }),
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    }),

  rooms: () =>
    queryOptions({
      queryKey: queryKeys.rooms(),
      queryFn: ({ signal }) => api<PlaySession[]>("/api/rooms", { signal }),
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    }),
}
```

**Freshness policy for realtime-backed queries.** `sessions`, `rooms` and
`notifications` are refreshed by Centrifugo (§6.6), so polling is only a
fallback for a dropped connection. Use a long `staleTime` (5 min) so remounts
and navigation don't refetch, and keep `refetchInterval` (30 s for sessions/
rooms, 10 s for notifications) as the safety net. The reconnect catch-up
(`onSubscribed`) covers gaps. Once that's proven in QA, the polling interval
can go up (e.g. 60 s) without changing what users see, because realtime
delivers changes immediately. The venue bundle has no channel yet, so it keeps
the 10 s poll and the default `staleTime` until the venue channel exists.

`listPlayerSessions()` and `listRooms()` should accept an optional
`AbortSignal` (or be replaced by direct `api()` calls in the query functions) so
route changes can cancel in-flight requests.

```ts
// src/features/play/api/session.mutations.ts
export function useRequestJoinRoom() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (roomId: string) => {
      const result = await requestJoinRoom(roomId)
      if (!result.ok) throw new ApiError(result.status, result.message)
      return result.data
    },

    onMutate: async (roomId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.rooms() })
      const previous = queryClient.getQueryData<PlaySession[]>(
        queryKeys.rooms()
      )
      queryClient.setQueryData<PlaySession[]>(queryKeys.rooms(), (rooms = []) =>
        rooms.map((room) =>
          room.id === roomId
            ? { ...room, roster: [...room.roster, pendingEntry] }
            : room
        )
      )
      return { previous }
    },

    onError: (error, _roomId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.rooms(), context.previous)
      }
      toast.error(error.message)
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.rooms() })
    },
  })
}
```

The exact optimistic shape can evolve; the important part is that **one cache
entry** is the source of truth and the server response/refetch reconciles it.
`applyServerSessions` and `mergeIncomingRequests` disappear.

### 6.5 Venue queries and mutations

```ts
// src/features/venue/api/venue.queries.ts
export const venueQueries = {
  venueBundle: (venueId: string) =>
    queryOptions({
      queryKey: queryKeys.venue.detail(venueId),
      queryFn: async ({ signal }) => {
        try {
          return await api<VenueSeed>(`/api/venue/${venueId}/bundle`, {
            signal,
          })
        } catch (err) {
          if (err instanceof ApiError && [403, 404].includes(err.status)) {
            throw notFound()
          }
          throw err
        }
      },
    }),
}

// `refetchInterval` on one observer refetches the *shared* bundle query, so
// customers/blocks refresh too (good: that fixes their staleness). It is not
// a reservations-only poll; it still transfers the whole bundle.
export function useVenueReservations(venueId: string) {
  return useQuery({
    ...venueQueries.venueBundle(venueId),
    select: (seed) => seed.reservations,
    refetchInterval: 10_000,
  })
}
```

```ts
// src/features/venue/api/venue.mutations.ts
export function useDecideReservation(venueId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (vars: {
      id: string
      decision: "approved" | "declined"
      reason?: string
    }) => decideReservation(venueId, vars.id, vars.decision, vars.reason),

    onSuccess: (updated) => {
      queryClient.setQueryData<VenueSeed>(
        queryKeys.venue.detail(venueId),
        (previous) =>
          previous && {
            ...previous,
            reservations: previous.reservations.map((reservation) =>
              reservation.id === updated.id ? updated : reservation
            ),
          }
      )
    },
  })
}
```

`addBlock`, `removeBlock`, `addCustomer`, and `addReservation` become mutation
callbacks that update the bundle cache. The schedule projection helpers can stay
as pure functions, but they read `blocks` and `reservations` from the query
result, not from `useState`.

**API follow-up:** add `GET /api/venues/:venueId/reservations` so the 10s poll
does not fetch the full bundle. Until then, the `select` above avoids duplicate
client state but still transfers the whole bundle.

### 6.6 Realtime invalidation

Build on the existing Centrifugo helper; do not reintroduce SSE.

```ts
// src/lib/query/realtime-query.ts
export function useChannelInvalidation(
  channel: string | null,
  queryKeys: readonly QueryKey[]
) {
  const queryClient = useQueryClient()
  // Callers pass fresh array literals every render; key the effect on a
  // stable string so it does not resubscribe on every render.
  const keysHash = JSON.stringify(queryKeys)

  React.useEffect(() => {
    if (!channel) return
    const keys = JSON.parse(keysHash) as QueryKey[]
    let debounce: ReturnType<typeof setTimeout> | undefined
    const invalidate = () => {
      for (const queryKey of keys)
        void queryClient.invalidateQueries({ queryKey })
    }
    // Collapse bursts (approve → chat add → notify) into one refetch.
    const onPublication = () => {
      clearTimeout(debounce)
      debounce = setTimeout(invalidate, 250)
    }
    // `onSubscribed` fires on every (re)subscribe: catch up on anything
    // missed while disconnected.
    const unsubscribe = subscribeToChannel(channel, onPublication, invalidate)
    return () => {
      clearTimeout(debounce)
      unsubscribe()
    }
  }, [channel, keysHash, queryClient])
}
```

Mount it once in the player workspace, not in every consumer:

```ts
useChannelInvalidation(ROOMS_CHANGES_CHANNEL, [
  queryKeys.rooms(),
  queryKeys.notifications(), // replaces ROOMS_CHANGED_EVENT
])
useChannelInvalidation(userSessionsChannel(user.id), [queryKeys.sessions()])
useChannelInvalidation(userNotificationsChannel(user.id), [
  queryKeys.notifications(),
])
```

**Invalidate, don't patch.** Publications are signals, not authoritative
payloads, so keep refetching rather than `setQueryData` from event data.
`rooms:changes` is a global channel: every room change anywhere refetches
`GET /api/rooms` for every online player, as it does today. That is acceptable
at demo scale but worth noting.

**Venue realtime (API follow-up):** add a channel such as
`personal:venue#<ownerUserId>` (or per-venue with an ownership check in the
token/subscribe proxy), published by the bookings/reservations services.
Until it exists, keep the poll, but run it through `refetchInterval`.

### 6.7 Session UI split

Keep only UI state in context:

```ts
interface SessionUiValue {
  activeSessionId: string | null
  managerOpen: boolean
  quickJoinOpen: boolean
  createRoomOpen: boolean
  playOpen: boolean
  booking: BookingUiState
  expiredEvents: ExpiredEvent[]
  // setters...
}
```

During migration only, keep a compatibility facade (deleted in Phase 5, §14):

```ts
export function useSession() {
  const data = useSessionData() // sessions + rooms queries
  const actions = useSessionActions() // mutation hooks
  const ui = useSessionUi() // context
  return { ...data, ...actions, ...ui }
}
```

That lets existing call sites keep working while the provider stops owning
server data. Then migrate leaves to `useSessionData()` / `useSessionActions()`
incrementally.

Remove dead surface while there:

- `setUserName` — derive name from `useAuthUser()`.
- `setUserLevel` — derive levels from the assessment query.
- `userLevel` — replaced by `userLevelForSport()` / `userLevels`.
- `localJoinedIds` — derive from sessions/rooms where the current user is on the
  roster.

### 6.8 `useData` / `useVenueData` as hooks

Keep the call-site API stable during the transition:

```ts
export function useData(): DataContextValue {
  const { data: seed } = useSuspenseQuery(dashboardQueries.seed())
  const location = useUserLocationContext() // small UI provider
  return React.useMemo(() => buildPlayerData(seed, location), [seed, location])
}
```

The provider is deleted; the hook reads the same query cache. If profiling shows
repeated expensive projections, add a derived-values provider later, but do not
let it own data.

> **Review caution:** `useMemo` inside a hook memoizes **per consumer**, so
> `buildPlayerData` (bound helpers like `conflictFor`, `courtDayBusy`) would run
> once per `useData()` caller instead of once, and helper identities would
> differ between components. The current `DataProvider` already satisfies the
> provider rule: it derives from query data and holds no mutable copy. So the
> cheapest correct move for Phase 4 is to **keep `DataProvider` as a derived
> provider** that reads the query itself (no `seed` prop), drop its dead
> fields, and move geolocation out. Delete it only if profiling says so.

For venue, `useVenueData(venueId)` can read the bundle query (and `useParams()`
internally for compatibility) and return the same shape as today, minus the
mutators that now live in mutations.

### 6.9 Notifications

```ts
export const notificationQueries = {
  list: () =>
    queryOptions({
      queryKey: queryKeys.notifications(),
      queryFn: listNotifications,
      refetchInterval: 10_000,
      refetchOnWindowFocus: true,
    }),
}

export function useNotifications() {
  const { data: records = [] } = useQuery(notificationQueries.list())
  const { expiredEvents } = useSessionUi()
  const [readLocal, setReadLocal] = React.useState<Set<string>>(new Set())
  // derive items, unreadCount, markRead, markAllRead
}
```

React Query deduplicates the request for the bell and the toaster, so the
**data** needs no provider.

> **Review correction:** the sketch above puts `readLocal` in a per-hook
> `useState`. With two consumers (the bell and the toaster), each would get its
> **own** read set: marking a client-only expiry item read in the bell would
> not clear it in the other consumer. `readLocal` must live in one shared
> place: a tiny UI provider, a `useSyncExternalStore` module store, or
> `sessionStorage` behind a store. The same applies to `expiredEvents`.

---

## 7. Implementation plan

### Phase 0 — Foundation (small)

- [ ] Add `src/lib/query-keys.ts`.
- [ ] Move inline queries from `profile-dialog`, `app-review-dialog`, and
      `payout-fields` into their feature `.queries.ts` files.
- [ ] Convert notification read/read-all to `useMutation`.
- [ ] Sort out `AbortSignal` support in `listPlayerSessions` / `listRooms`.
- [ ] Ban `invalidateQueries()` with no key through a review checklist item or
      a CI grep (`rg 'invalidateQueries\(\)'`). **Do not** add an ESLint rule:
      `eslint.config.js` in web-shuttio is intentionally left untouched.
- [ ] Rename `["venue", id]` → `queryKeys.venue.detail(id)` in **one** commit
      that also updates every `invalidateQueries` in `venue-api.ts`
      (`:242,258,267`) and `venue.queries.ts`. A partial rename silently
      breaks invalidation.

**Exit criteria:** no behavior change; all existing tests/typecheck/lint pass.

### Phase 1 — Venue workspace (recommended first slice)

- [ ] Add `useVenueData(venueId)` as a query-backed hook.
- [ ] Delete `VenueDataProvider`.
- [ ] Delete `VenueProvider` / `VenueWorkspaceProvider`; replace
      `useVenue()` stats with `venueStats` from the bundle.
- [ ] Add `useVenueReservations(venueId)` with `select` + `refetchInterval`.
- [ ] Convert reservation decisions, check-in, cancel, reschedule, walk-in,
      customer creation, and court blocks to mutation hooks.
- [ ] Update `command.tsx`, `schedule.tsx`, `reservations.tsx`,
      `customers.tsx`, `courts.tsx`, `analytics.tsx`, and `manage.tsx` to use
      the new hooks.
- [ ] Remove the local customer aggregate from `addReservation`; let the
      bundle refetch provide the server truth. The walk-in mutation must
      `await invalidateQueries(venue.detail)` in `onSuccess` (or return the
      upserted customer from the API). Otherwise the exit criterion "walk-in
      customer appears immediately" fails until the next 10 s poll.
- [ ] Mount the poll **once** (layout level). A `useVenueReservations` call
      per page component is fine for dedup, but the interval must not depend
      on which page happens to be mounted.
- [ ] Optional API follow-up: `GET /api/venues/:venueId/reservations`.

**Exit criteria:**

- Adding a block, walk-in, customer, or court appears immediately after the
  mutation.
- A second tab sees the change on the next poll/refetch.
- `customers`/`blocks` are never stale after a bundle refetch.
- No `useState(seed.*)` for server lists in the venue workspace.
- Only one cache entry per venue in React Query devtools.

**Rough effort:** 1–2 days.

### Phase 2 — Player sessions and matchmaking

- [ ] Extract pure derive functions into
      `src/features/play/lib/matchmaking-derive.ts`:
      `deriveRooms`, `deriveJoinedIds`, `deriveRequested`, `deriveHosted`,
      `deriveActiveRoom`.
- [ ] Add unit tests for those functions.
- [ ] Add `sessionQueries.mine()` and `sessionQueries.rooms()`.
- [ ] Convert writes to mutation hooks:
      `saveSession`, `requestJoinRoom`, `decideRoomRequest`, `disbandRoom`,
      `leaveRoomMembership`, `createBookingHold`, `cancelBookingRecord`,
      plus the room-chat side effects.
- [ ] Split `SessionProvider` into: - `useSessionData()` — query data + derived projections - `useSessionActions()` — mutations - `SessionUiProvider` — dialogs, active id, booking draft, expiry events
- [ ] Keep `useSession()` as a compatibility facade during the migration.
- [ ] Remove `sessions`, `crossRooms`, `localJoinedIds`, `assessmentLevels`,
      `userName`, `setUserName`, and `setUserLevel` from context.
- [ ] Replace both polling effects with React Query `refetchInterval`.
- [ ] Replace the hand-written Centrifugo refetch effects with
      `useChannelInvalidation`, passing `onSubscribed` for reconnect catch-up.
- [ ] Seed the sessions query from `seed.sessions` via `initialData` +
      `initialDataUpdatedAt` so the first render does not double-fetch.
- [ ] Port the "never clobber" rule: today a refetch never overwrites a
      `forming` session or one with `holdExpiresAt` (`session.tsx:110,467`).
      With React Query, a 30 s refetch landing between an optimistic create
      and its `saveSession` **will** drop the new room. Every session write
      must `cancelQueries` in `onMutate` and invalidate only in `onSettled`
      after the save resolves.
- [ ] Decide failure UX for `persist()`: today failures are swallowed and the
      UI keeps the optimistic copy. Rolling back is a visible behavior change;
      keep it deliberate and add Vietnamese error copy to `messages/vi.json`
      (and `en.json`).
- [ ] Mount the data hooks only in the player workspace so admin/venue routes
      do not poll matchmaking endpoints.
- [ ] Replace `ROOMS_CHANGED_EVENT` with query invalidation.

**Exit criteria:**

- Join/approve/decline/leave/create/cancel still work end to end.
- Optimistic updates roll back on 409/failure.
- One source of truth for sessions and rooms in React Query devtools.
- A Centrifugo publication on `rooms:changes` / `personal:sessions#…`
  refetches the matching query exactly once (debounced), and a reconnect
  triggers a catch-up refetch.
- No provider holds an array of server sessions.

**Rough effort:** 5–8 days. The original 3–5 days underestimates a
2,200-line provider with ~10 server writes, room-chat side effects, hold
timers and an expiry sweep, and no component-test harness yet.

**Main risk:** client-only `forming` sessions. `GET /api/sessions` returns only
persisted documents, so either await `saveSession` before invalidating or keep
unsaved drafts in a separate client-only store. Do not merge drafts into the
server cache.

### Phase 3 — Notifications and assessment

- [ ] Add `notificationQueries.list()`.
- [ ] Replace `NotificationsProvider` data with `useNotifications()`.
- [ ] Keep a UI-only provider for `readLocal` if it must survive navigation;
      otherwise use `sessionStorage`.
- [ ] Add `useMarkNotificationRead` / `useMarkAllNotificationsRead` mutations
      with rollback.
- [ ] Add `assessmentQueries.mine()` and a `useSaveAssessment` mutation.
- [ ] Use localStorage only as `initialData` / optimistic cache.
- [ ] Simplify `PlayerAssessmentGate` to query + `Navigate`.
- [ ] Remove the assessment sync effect from the session provider.

**Exit criteria:**

- Notification read state is consistent after a failed server call.
- Assessment state has one source of truth; localStorage is only a cache.
- The gate has no `ready`/effect dance.

**Rough effort:** ~1 day.

### Phase 4 — Remove `DataProvider` and trim the seed

- [ ] Replace `useData()` with a query-backed hook + `LocationProvider`.
- [ ] Delete `DataProvider`.
- [ ] Move geolocation to `src/features/dashboard/state/location.tsx` (or a
      `useSyncExternalStore` module) so it does not prompt on every `/app`
      visit.
- [ ] After `web/` is deleted and deletion is approved, remove unused `Seed`
      fields (`venue`, `activeVenueId`, `rooms`, `bookings`, `notifications`,
      `stats`, `activity`, `streak`, and eventually `sessions`).
- [ ] Consider a slim `GET /api/player/bootstrap` endpoint.

**Exit criteria:**

- No `DataProvider` in the route tree.
- `/api/seed` does not build an operator bundle for player routes.
- Geolocation is requested only where needed.

**Rough effort:** ~1 day plus API/shared-type coordination.

### Phase summary

| Phase | Scope                                   | Effort       | Main win                                    |
| ----- | --------------------------------------- | ------------ | ------------------------------------------- |
| 0     | Keys, inline queries, safety nets (§15) | ~1.5 days    | Error boundaries, MSW, validation checklist |
| 1     | Venue workspace                         | ~1–2 days    | Removes 2 providers, fixes stale data       |
| 1.5   | Booking wizard + expiry rule            | ~3 days      | Takes the hardest parts off Phase 2         |
| 2     | Player sessions/matchmaking             | ~4–6 days    | Removes the 2,200-line cache                |
| 3     | Notifications + assessment              | ~1 day       | Fewer effects and duplicate states          |
| 4     | `DataProvider` + seed trim              | ~1 day + API | Smaller payload, no shell duplication       |
| 5     | Prune facades + dead code               | ~1–2 days    | One way to read each piece of state         |

---

## 8. Testing strategy

### Unit tests

- `deriveRooms(sessions, rooms, user)` — own, joined, requested, hosted,
  cancelled, malformed roster.
- `deriveJoinedIds(...)` — host, member, solo hold, left room.
- `deriveRequested(...)` — pending requests, approved, declined, expired.
- Venue schedule projection — reservation overlay, block overlay, block wins
  over a reservation, past-slot flags.
- `applyServerSessions` replacement — no longer needed, but remove its tests
  with it.

### Query/mutation tests

- **Prerequisite:** `package.json` has `vitest` but no `jsdom`/`happy-dom`,
  `@testing-library/react`, or `msw`. Add them (and a vitest `environment`
  for hook tests) in Phase 0, or test mutations through `QueryClient` +
  `MutationObserver` directly without rendering.
- Create a fresh `QueryClient` per test; wrap with `QueryClientProvider`.
- Mock the API module with `vi.mock` or MSW.
- Verify a successful mutation updates the cache and a failed mutation restores
  the previous cache.
- Verify `invalidateQueries` uses the exact key, not the root.

### Manual QA

- Two browser windows signed in as player and venue operator.
- Player books → venue approves/declines → player sees the status change
  without a refresh.
- Venue adds a walk-in, customer, and block → schedule and customer list update;
  a second tab sees them after the poll.
- Player joins a room → host sees the request; host approves → player sees the
  seat.
- Cancel a booking before/after transfer proof; check refund queue.
- Disconnect the network briefly; verify optimistic updates roll back and the
  next poll recovers.
- Kill the Centrifugo container briefly, make a change, restart it: the
  client reconnects and the `onSubscribed` catch-up shows the change.
- React Query devtools: one cache entry per resource; no duplicate polling
  observers in venue/admin workspaces.

---

## 9. Acceptance criteria

- [ ] No context value contains `sessions`, `crossRooms`, `reservations`,
      `customers`, `blocks`, or `notifications` arrays.
- [ ] No provider calls `fetch`, `listRooms`, `listPlayerSessions`, or
      `fetchVenueReservations`.
- [ ] No `useState(seed.*)` for server records.
- [ ] No `invalidateQueries()` with no query key.
- [ ] One query per resource in React Query devtools.
- [ ] A refetch does not create a second request per polling loop.
- [ ] Every Centrifugo subscription goes through `useChannelInvalidation`;
      no `ROOMS_CHANGED_EVENT` or other `window` events carry server-data
      signals.
- [ ] Adding a venue block/walk-in/customer appears immediately; a second tab
      sees it on the next poll.
- [ ] Joining/approving/declining/cancelling still works, including optimistic
      rollback on a 409.
- [ ] Existing Vietnamese copy and user flows are unchanged.
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass.

---

## 10. Risks and mitigations

| Risk                                                                          | Mitigation                                                                                                             |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Client-only `forming` sessions disappear when switching to the server query   | Await `saveSession` before invalidation, or keep unsaved drafts in a separate client-only store.                       |
| Malformed rooms from other users crash the UI                                 | Keep `wellFormedRooms()` as a query `select` or validate in the API.                                                   |
| Shared `Seed` type changes break the old `web/` app                           | Do not trim `Seed` until `web/` is deleted and deletion is approved; coordinate `api/src/shared` and `web/lib/shared`. |
| Venue bundle polling is expensive                                             | Add `GET /api/venues/:venueId/reservations`; increase the interval; add a Centrifugo venue channel.                    |
| React Compiler / memoization hides re-render cost                             | Keep `useMemo` on derived arrays and `Set`s; use `select` for narrow subscriptions.                                    |
| Optimistic update overwrites a newer server snapshot                          | Cancel in-flight queries in `onMutate`, capture previous data, and always invalidate in `onSettled`.                   |
| Module-level QueryClient leaks state in tests or future SSR                   | Move to `getQueryClient()` per request/browser and migrate API modules to mutation hooks.                              |
| Removing `DataProvider` causes a geolocation permission prompt in more places | Keep a small `LocationProvider` mounted once; do not call `useUserLocation()` per consumer.                            |
| `Date.now()` / random in render breaks deterministic output                   | Keep using `seed.serverNow` / `todayIso` in derived selectors.                                                         |
| Refactor diff becomes too large to review                                     | Land Phase 1 (venue) first; keep `useSession()`/`useData()` compatibility facades during Phase 2/4.                    |

---

## 11. Appendix — file impact map

| File                                                       | Action                                                                                                     |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/features/play/components/session.tsx`                 | Split into data hooks, mutation hooks, and a UI-only provider. Remove 2,200-line cache.                    |
| `src/features/play/components/matchmaking.tsx`             | Re-export data/UI/actions from the new hooks; remove dead fields.                                          |
| `src/features/venue/components/venue-data-provider.tsx`    | Delete; replace with `useVenueData` + query/mutations.                                                     |
| `src/features/venue/components/venue-provider.tsx`         | Delete; use `venueStats` from the bundle.                                                                  |
| `src/features/dashboard/components/data-provider.tsx`      | Delete; replace with `useData()` hook + `LocationProvider`.                                                |
| `src/features/dashboard/components/notifications.tsx`      | Use `notificationQueries` + `useNotifications()`; keep only UI state in context if needed.                 |
| `src/features/venue/api/venue-api.ts`                      | Remove global `queryClient` invalidations; expose raw calls for mutation hooks; add reservations endpoint. |
| `src/features/play/api/session-api.ts`                     | Add `signal` support; let mutations own persistence/rollback.                                              |
| `src/features/play/api/rooms-api.ts`                       | Add `signal` support; keep `ApiResult` branching in mutation hooks.                                        |
| `src/lib/query-client.ts`                                  | Export only `createQueryClient()`; the client is created in `getRouter()` (Phase 5, §6.3).                 |
| `src/lib/realtime.ts`                                      | Keep; wrap with `useChannelInvalidation` (`src/lib/query/realtime-query.ts`).                              |
| `src/routes/_authenticated/app/route.tsx`                  | Remove `DataProvider` and `SessionProvider` data ownership; keep `LocationProvider` / UI providers.        |
| `src/routes/_authenticated/app/venue/$venueId/route.tsx`   | Remove `VenueDataProvider` / `VenueWorkspaceProvider`; keep the suspense query.                            |
| `src/features/dashboard/components/profile-dialog.tsx`     | Move inline query to `assessmentQueries`.                                                                  |
| `src/features/app-review/components/app-review-dialog.tsx` | Move inline query to `appReviewQueries`.                                                                   |
| `src/features/venue/components/payout-fields.tsx`          | Move inline `["banks"]` query to `venueQueries`/`bankQueries`.                                             |
| `src/features/booking/components/bookings.tsx`             | Remove mount-time `invalidateQueries(["seed"])`; rely on stale time/realtime.                              |
| `src/features/booking/components/payment-screen.tsx`       | Replace broad invalidation with targeted keys.                                                             |
| `src/features/venue/components/payment-review.tsx`         | Replace broad invalidation with targeted keys.                                                             |

---

## 12. Recommendation

Implement **Phase 1 (venue workspace)** first. It is the smallest
self-contained slice, it removes two providers, it fixes a real consistency
bug, and it proves the query/hook pattern before the 2,200-line player session
provider is touched.

---

## 13. Addendum — booking wizard and expiry sweep

Both were left out of the original plan. Both live in `SessionProvider`
today, and both have to be settled **before Phase 2**, because they read
`sessions` and cannot be split off until the sessions query exists.

### 13.1 Booking wizard

**Current state** (`src/features/play/components/session.tsx`)

- State: `open`, `courtId`, `linkedId`, `courtless`, `step`, `draft`
  (`BookingDraft`: `dayKey`, `slot`, `durationMin`, `fillMode`, `invitees`),
  `paying`, `checkoutError` (`:441–450`).
- Entry points: `armBooking` / `openBooking` (`:1679–1712`) seed the draft from
  a linked room and navigate to `/app/book`. They are called from
  `bookCourtForSession`, `rebookFrom`, find-courts, the play chooser and the AI
  dashboard.
- Derived values read **server sessions**: `slotBlocked`, `draftConflict`,
  `courtBusy`, `courtGaps` (`conflictFor`/`courtDayBusy`/`courtDayGaps` over
  `sessions`).
- Write path: `pay()` → `reserveHold()` → `createBookingHold`
  (`POST /api/bookings`), then a hand-built `PlaySession` is pushed into
  `sessions` and `persistNow()` saves it. A retry reuses
  `linked.reservationId` via `setLinkedId(roomId)`.
- Consumers reach it through `useSession()` and the `booking.tsx` facade
  (`useBooking`).

**Problems**

1. UI state and a server write are tangled together: `reserveHold` mutates
   `sessions` locally after the server already created the booking, so the
   client builds a second copy of a record the API owns.
   `GET /api/sessions` already derives the same `booked`/`hold:"pending"` view
   from the booking (`sessions.service.ts:153`).
2. A booking happens in two non-atomic requests: `POST /api/bookings`, then
   `PUT` session. If the second one fails, it is swallowed, so a booking can
   exist without its session linkage (`reservationId`) until a later reconcile.
3. The retry guard depends on `linkedId` being in provider state. A reload
   between "hold created" and "payment screen" loses it, and a second click
   creates a second hold (the server 409s only if the slot overlaps, which is
   exactly the case here, so the player sees a confusing conflict toast for
   their own hold).
4. Every keystroke in the wizard re-renders every `useSession()` consumer,
   because the draft is in the same context value as the sessions.

**Target**

```text
features/booking/
  state/booking-draft.tsx    # BookingDraftProvider: open, courtId, linkedId,
                             # courtless, step, draft, checkoutError
  api/booking.mutations.ts   # useCreateBookingHold()
  hooks/use-booking-wizard.ts# draft + derived conflict bands + pay()
```

- `BookingDraftProvider` holds **only** the wizard fields. It is mounted at the
  `/app` layout (the draft must survive `openBooking` → navigate to `/book`).
  Its value never includes sessions.
- `armBooking(cid, opts)` takes the linked room as an argument (callers already
  have it) instead of looking it up in `sessions`, so the provider has no
  dependency on the sessions query.
- Derived bands move into `useBookingWizard()`, which combines the draft with
  `useQuery(sessionQueries.mine())` (plus `rooms` if cross-user holds must
  block). They are pure functions of `(sessions, draft, linkedId)`, so they go
  in `matchmaking-derive.ts` with unit tests.
- `paying` is **not** state any more: it is `createHold.isPending`.
- `useCreateBookingHold()`:
  - `mutationFn`: `createBookingHold`, then (for a brand-new booking)
    `saveSession`. Both are awaited, so a failed save surfaces as an error
    instead of being swallowed.
  - `onSuccess`: `setQueryData` the returned session into
    `queryKeys.sessions()` for an instant UI, then `invalidateQueries` so the
    server view (from `sessions.service`) replaces the client-built one.
  - 409 / 422 handling and the Vietnamese toasts stay exactly as in
    `reserveHold` (`m.booking_toast_conflict()`, server message for 422).
- **Idempotency is a server guarantee (primary fix, API).** Today a retry
  after a reload hits the self-overlap check (`bookings.service.ts:1053`) and
  the player gets "Bạn đã có một lượt đặt sân khác trong khung giờ này" for
  their **own** hold. In `createHold`, before that check, look up an
  `awaiting_payment` booking with the same `userId` + `courtId` + `dateKey` +
  `start` + `durationMin` and return it unchanged (200, same body). Key on the
  slot, not `sessionId`: a brand-new booking's `sessionId` is generated per
  attempt (`newId("bk")`), so it differs after a reload. Add an API test.
- The client then needs no persisted retry state: calling
  `useCreateBookingHold` again is safe. Drop the `linkedId`-based reuse in
  `reserveHold` once the API change ships.
- Keep `useBooking()` (`booking.tsx`) as the compatibility facade; point it at
  `useBookingWizard()` instead of `useSession()`.

**Steps** (can land before the rest of Phase 2):

- [ ] Extract `slotBlocked`/`draftConflict`/`courtBusy`/`courtGaps` into pure
      functions with tests.
- [ ] Add `BookingDraftProvider`; move the eight fields and the wizard setters
      (`next`, `back`, `setCourt`, `setDay`, `setSlot`, `setDuration`,
      `pickSlot`, `setFillMode`, `toggleInvite`, `closeBooking`,
      `clearCheckoutError`) out of `SessionProvider`.
- [ ] Change `armBooking` to take the linked session; update its callers
      (find-courts, play-chooser, ai-native-dashboard, bookings,
      `bookCourtForSession`, `rebookFrom`).
- [ ] API: make `createHold` idempotent on the slot (above) + test.
- [ ] Add `useCreateBookingHold`; reimplement `pay()` on it. Until the sessions
      query lands, its `onSuccess` can still call the provider's `setSessions`
      through a temporary callback.
- [ ] Re-point `useBooking()`; check that `book.tsx` renders unchanged.

**Exit criteria:** typing in the wizard does not re-render the room list; a
reload on the payment step followed by "Thanh toán" reuses the existing hold;
a failed session save shows an error instead of silently losing the linkage.

**Effort:** ~1.5–2 days. It also shrinks `session.tsx` by roughly 350 lines,
which reduces Phase 2's risk.

### 13.2 Expiry sweep

**Current state** (`session.tsx:783–866`)

Every 30 s (and once on mount), `sweepExpirations` walks `sessions` and:

1. releases a `forming` room's court hold whose `holdExpiresAt` has passed
   (clears `courtId`/`courtLabel`/`slot`), **persists** it, toasts
   `m.booking_toast_hold_expired()` and pushes an `expiredEvents` entry;
2. drops roster entries in `requested` (> 2 h) or `pending` invite (> 6 h)
   state, toasts, and pushes an `expiredEvents` entry, **without persisting**.

`expiredEvents` feeds the notification bell (`notifications.tsx:74,118`) as
client-only items. Blocking correctness does not depend on the sweep:
`conflictFor` and the API's `courtHolds` already ignore expired holds on read
(`api/src/shared/helpers.ts:446`).

**Problems found**

1. **Request/invite expiry exists only in the client.** The API never expires a
   `requested` entry: `rooms.service.ts:337` approves any
   `rsvp: "requested"` regardless of `rsvpAt`. The client sweep drops it
   locally and never saves that, so the next refetch brings it back. Today
   `applyServerSessions` partly hides this. With React Query (cache replaced on
   every refetch) the sweep would re-drop it **and toast again every 30 s**.
2. The sweep cannot exist as written after Phase 2: it calls `setSessions` on
   what will be the query cache. A timer that rewrites cache data would be
   overwritten by the next poll and fight it.
3. Hold release depends on the host's browser being open. If it is closed, the
   room keeps a dead court/slot in MongoDB until the host comes back.
4. `Date.now()` is read inside the sweep, which is fine (effect, not render),
   but the derived "is expired" checks elsewhere must keep using the same
   clock source so the toast and the UI agree.

**Target: expiry is a server rule, the client only notices it**

- **API (preferred, small):**
  - Rooms/sessions read path: treat `requested` older than 2 h and `pending`
    invites older than 6 h as absent (filter on read, like `courtHolds`
    already does for holds), and refuse to approve them
    (`rooms.service.ts:306,337` → `ConflictException`). Put the TTLs in the
    shared helpers on **both** sides (`api/src/shared`, `web-shuttio`'s
    `src/lib/shared`) so the client stops owning `REQUEST_EXPIRY_MS` /
    `INVITE_EXPIRY_MS`.
  - Optionally clean the stored fields lazily on the next write, or with a
    periodic job; filtering on read is enough for correctness.
- **Client:**
  - Replace the cache-mutating sweep with a **derived** view: a pure
    `deriveExpiries(sessions, now)` returns `{ heldExpired, rsvpExpired }`,
    and the UI hides expired items through the same helpers the API uses.
  - A small `useExpiryNotices()` hook (mounted once in the player workspace)
    ticks a `now` every 30 s, computes newly expired items, and fires the toast
    plus an `expiredEvents` entry **once per item id**. It keeps a `notified`
    `Set` keyed by `hx-<sessionId>-<holdExpiresAt>` /
    `rx-<sessionId>-<userId|initials>-<rsvpAt>` in the UI store, so refetches
    cannot re-toast.
  - Hold release: the host's client still persists the cleared court
    (`useSaveSession` mutation) when it notices an expired hold, until the API
    does it itself. The API filter means correctness never depends on it.
  - `expiredEvents` and the `notified` set live in the shared UI store from
    §6.9 (not per-hook state), next to `readLocal`.

**Steps**

- [ ] API: shared TTL constants + `isRsvpExpired()` helper in both
      `shared/` copies; filter expired `requested`/`pending` entries in the
      rooms/sessions read path; reject approving an expired request; tests
      in `api/test/`.
- [ ] Client: `deriveExpiries` + unit tests (boundary at exactly the TTL,
      missing `rsvpAt`, host never expires, hold without `holdExpiresAt`).
- [ ] Client: `useExpiryNotices()` with the dedupe set; remove
      `sweepExpirations`, its interval, and the `timers` pool if nothing else
      uses it (check the RSVP timers at `:754–773` first).
- [ ] Keep the existing Vietnamese toasts
      (`booking_toast_hold_expired`, `session_toast_request_expired`,
      `session_toast_invite_expired`) unchanged.

**Exit criteria:** an expired request never comes back after a refetch or
reload, and the host cannot approve it; each expiry toasts exactly once per
browser session; no timer writes to the React Query cache.

**Effort:** ~0.5 day API + ~1 day client.

### 13.3 Where this fits

Revised order: **Phase 0 → Phase 1 (venue) → Phase 1.5 (§13.1 wizard
extraction + §13.2 API expiry rule) → Phase 2 (sessions/rooms queries) →
Phase 3 → Phase 4.** Phase 1.5 works against today's `SessionProvider`, so
it can ship on its own, and it takes two of Phase 2's hardest parts off the
critical path. With it, Phase 2 drops back toward ~4–6 days.

---

## 14. Simplification mandate

**Goal:** make state management as small as possible **without changing
business requirements**. Where this section conflicts with an earlier one, this
section wins.

### 14.1 What counts as a business requirement (must not change)

- Every user flow: book, pay by transfer, cancel, join/request/approve/decline/
  leave/disband a room, invite, quick join, venue approve/decline/check-in/
  walk-in/block/customer, notifications, assessment gate, onboarding redirect.
- Business rules and numbers: request TTL 2 h, invite TTL 6 h, court-hold
  expiry, max capacity, 409/422 conflict handling, payment-hold window.
- Freshness the user can see: realtime room/session/notification updates, venue
  reservations within ~10 s, focus refetch.
- All Vietnamese (and English) copy, toasts and their wording.

**Not** requirements, so free to change: provider shapes, hook names, file
layout, optimistic vs. wait-then-refetch for writes, poll mechanics, internal
ids.

### 14.2 Simplification rules

1. **No server data outside React Query.** No `useState`, `useRef` or context
   holding an API record.
2. **Wait, then refetch, by default.** A mutation is `mutationFn` +
   `onSuccess: invalidate(key)`. Use `onMutate`/rollback **only** where the
   round trip is visibly slow in a demo: request to join, approve/decline,
   venue approve/decline. Everything else waits (show `isPending` on the
   button). This removes most rollback code the earlier sections sketched.
3. **Return the record, write it once.** When the API already returns the
   updated record, `setQueryData` it and skip the invalidate. Don't do both.
4. **Derive, don't store.** Anything computable from query data plus UI state
   is a pure function in a `*-derive.ts`, called in render (with `useMemo` only
   where profiling shows a cost).
5. **One file per feature for server state** (`<feature>.queries.ts`: keys
   usage, `queryOptions`, mutation hooks). No `.mutations.ts`, `state/`,
   `hooks/` splits for one file.
6. **No facades in the end state.** A component calls the narrowest hook it
   needs (`useSessionData()`, `useBookingDraft()`, a mutation hook). Facades
   exist only while a phase is in progress.
7. **Context only when two distant components share UI state.** Otherwise
   local `useState`. A provider that would hold one boolean is a prop or URL
   search param instead.
8. **Don't build for hypotheticals.** No extra query-client factory beyond
   creating it in `getRouter()` (§6.3), no
   per-resource realtime abstraction beyond `useChannelInvalidation`, no
   bootstrap endpoint unless the seed trim needs it.
9. **Delete as you go.** Each phase removes the code it replaces in the same
   PR; no "remove later" leftovers.

### 14.3 Phase 5 — Prune facades and dead code

- [ ] Move every `useSession()` / `useMatchmaking()` / `useBooking()` caller (17
      files today) to the narrow hooks; delete the three facades
      (`session.tsx:353`, `matchmaking.tsx`, `booking.tsx`).
- [ ] Remove anything the facades kept alive that has no caller left
      (check with `rg` per exported name; `knip` can help).
- [ ] Remove the `timers` pool in `session.tsx` if Phase 1.5 left nothing using
      it.
- [ ] Create the `QueryClient` inside `getRouter()` and delete the exported
      singleton (§6.3), once no module imports it.
- [ ] Remove `PLAYER_ASSESSMENT_UPDATED_EVENT`, `ROOMS_CHANGED_EVENT` and any
      other `window` events used as data signals.
- [ ] Collapse any provider left holding ≤ 2 fields into local state, a prop,
      or a URL search param (e.g. `managerOpen` + `activeSessionId` →
      `?room=<id>`, if the room manager is opened from more than one place).
- [ ] Move `session.tsx` actions that are now plain mutation hooks next to their
      feature, so `session.tsx` contains only the UI provider.

**Exit criteria:** the targets in §14.4 are met; `pnpm typecheck`, `pnpm lint`
and `pnpm test` pass; the manual QA in §8 passes unchanged.

### 14.4 Measurable targets

Baselines measured on 2026-10-21.

| Metric                                                      | Today                                                                       | Target                                        |
| ----------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------- |
| `session.tsx` lines                                         | 2,200                                                                       | ≤ 400 (UI provider only)                      |
| Providers (`createContext` in `features/`)                  | 5 (`Data`, `Session`, `Notifications`, `VenueData`, `VenueWorkspace`)       | ≤ 4, none holding API arrays                  |
| `useState` in providers                                     | 28 (session 20, venue-data 3, venue 3, notifications 2)                     | ≤ 12, all UI-only                             |
| `setInterval` for data                                      | 3 (`session.tsx:573,619`, `venue-data-provider.tsx:172`) + 1 sweep (`:856`) | 0 (`refetchInterval` only)                    |
| Hand-written merge/reconcile functions                      | 3                                                                           | 0                                             |
| Facade hooks (`useSession`, `useMatchmaking`, `useBooking`) | 3, 17 caller files                                                          | 0                                             |
| `window` events used as data signals                        | 2                                                                           | 0                                             |
| `invalidateQueries()` with no key                           | 10                                                                          | 0                                             |
| Copies of assessment state                                  | 4                                                                           | 1 (query; localStorage only as `initialData`) |
| Modules importing the `queryClient` singleton               | 4                                                                           | 0                                             |

`calendar-ui.tsx:68` is a clock tick for rendering, not a data poll; it stays.

### 14.5 Revised order

0 → 1 → 1.5 → 2 → 3 → 4 → **5**. Each phase lands as its own PR, deletes what
it replaces, and moves at least one row of §14.4 toward its target. Report the
row values in each PR description.

---

## 15. Safety nets

These make "no business change" checkable instead of resting on manual QA.
They land **before** the refactor phases they protect.

### 15.1 Agent-run browser validation (every phase)

No Playwright suite. The implementing agent validates each phase itself in a
real browser (the `run` skill / Claude in Chrome) against
`docker compose up --build --watch`, signed in with the dev test accounts
(player + venue; the user signs in, no passwords stored).

Each phase's PR must include a short validation report: the scenarios below
that apply, pass/fail for each, and anything unexpected in the console or
network tab.

| Scenario         | Steps the agent runs                                                                                           | Phases |
| ---------------- | -------------------------------------------------------------------------------------------------------------- | ------ |
| Venue operations | approve and decline a reservation; add a walk-in, a customer and a block; a second tab shows them after a poll | 1      |
| Booking          | book a court → payment screen; reload, pay again → same hold, no conflict toast; cancel before transfer proof  | 1.5, 2 |
| Rooms (realtime) | two tabs/accounts: create room → request → approve; the member's tab updates **without reload**; leave         | 2      |
| Expiry           | a request past its TTL disappears, stays gone after reload, and the host cannot approve it                     | 1.5    |
| Notifications    | an approval creates a bell item; mark read survives navigation                                                 | 3      |
| Assessment gate  | a fresh player hits the gate; after saving, reaches the dashboard                                              | 3      |
| Errors           | stop the api container: the error screen shows "Thử lại"; restart the api, click it, the page recovers         | 0      |

- Check Vietnamese copy and toasts against `messages/vi.json`; any visible
  wording change is a failure.
- Watch the network tab for duplicate polling (one request per query per
  interval) and for refetches on every navigation.
- Pure functions and mutation hooks are still covered by vitest (§15.3); the
  browser pass covers what unit tests can't.

### 15.2 Error boundaries for suspended queries (Phase 0)

The layouts use `useSuspenseQuery`, and no route defines an `errorComponent`
today, so a failed seed or venue bundle fetch falls through to the router
default.

- Add a `defaultErrorComponent` in `src/router.tsx` (Vietnamese copy in
  `messages/vi.json` + `en.json`, with a "Thử lại" button).
- Wrap retries with `useQueryErrorResetBoundary()` so "Thử lại" both resets
  the boundary and refetches the failed query (TanStack Router's
  `errorComponent` receives `reset`; call `queryErrorResetBoundary.reset()`
  in the route's `onError`/`errorComponent`).
- Give `/_authenticated/app` and `/_authenticated/app/venue/$venueId`
  route-level `errorComponent`s, so a venue bundle failure keeps the sidebar.
- 403/404 keep their current behavior (`notFound()` in `venueBundle`).

### 15.3 MSW for query/mutation tests (Phase 0)

- Add `msw` and `happy-dom` (or `jsdom`) + `@testing-library/react`; set the
  vitest `environment` for `*.test.tsx` only, so existing pure tests stay
  fast.
- One `src/test/server.ts` with handlers per feature. Mock at the HTTP layer,
  not with `vi.mock` of API modules, so the tests also cover `api()`, auth
  headers and `ApiError` mapping.
- Required tests per mutation hook: success updates/invalidates the exact key;
  failure leaves the cache unchanged (or rolled back, for the optimistic ones
  in §14.2).

### 15.4 Validate API responses where bad data can crash the UI

`zod` is already a dependency. Validate **only** at the boundaries where other
users' data enters the client, not every endpoint:

- `GET /api/rooms` (other users' rooms; today guarded by `wellFormedRooms()`):
  a `PlaySession` schema in the query function, dropping invalid items with a
  `console.error` rather than throwing, so one bad room cannot blank the list.
  This replaces `wellFormedRooms()`.
- Centrifugo publications: no validation needed while they are only used as
  "something changed" signals (§6.6).
- Everything else trusts the typed API, as today. Revisit if a crash is traced
  to a malformed response.

### 15.5 Updated order

**0 (+ §15.2–15.4) → 1 → 1.5 → 2 → 3 → 4 → 5.** Phase 0 grows to about
1.5 days. Every later phase ends with the agent's browser validation pass
(§15.1) before it merges.
