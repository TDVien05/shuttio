# State Refactor Handoff

## Status

The React Query / UI-context refactor described in `STATE_REFACTOR_PLAN.md`
(Phases 0–5, including the booking-wizard and expiry addendum) is implemented
in this working tree and is ready to land together with this document.

- Base commit: `951957a` (`chore: checkpoint state refactor and chat migration work`)
- Scope: `web-shuttio/` only. No `api/` source changes were needed; the API
  guarantees that Phase 1.5 relies on (`createHold` idempotency and read-time
  RSVP expiry) were already present on the base commit and are covered by the
  API test suite.
- Verification: typecheck, lint, tests and the production build pass in both
  projects. The manual two-account browser QA could not be run in this
  environment; see **Manual QA** below before merging to a production branch.

## End state

- **React Query owns every server record.** Seed, player sessions/rooms,
  notifications, assessment, venue bundles/reservations, admin rows,
  onboarding/account state and chat caches all live behind query keys from
  `src/lib/query-keys.ts`.
- **Contexts hold UI state only.** Four contexts remain: `DataProvider`
  (derived seed projections, intentionally retained), `LocationProvider`,
  `SessionUiProvider` and `BookingDraftProvider`. None holds a server array or
  exposes a server-data mutator.
- **Mutations own writes.** Feature `*.queries.ts` modules define query options
  and mutation hooks. Mutations use targeted invalidation; optimistic
  mutations use the four-step `onMutate` pattern with a pure transform helper.
- **Realtime is query invalidation.** Every Centrifugo subscription goes
  through `useChannelInvalidation` in `src/lib/realtime.ts`. The old
  `ROOMS_CHANGED_EVENT` / `PLAYER_ASSESSMENT_UPDATED_EVENT` data signals are
  gone. The only remaining window event is the UI-only `clear-ai-chat` signal.
- **One QueryClient per router instance.** `src/router.tsx` creates the client;
  `src/lib/query-client.ts` is deleted.
- **Player-only session loading.** Session/room queries, the expiry watcher and
  the session/room realtime channels mount only in the player workspace.
  Notifications remain global so the operator/admin bell stays live.

## Per-phase changes

### Phase 0 — Foundation

- Added the centralized key factory `src/lib/query-keys.ts`.
- Moved the remaining inline reads into feature query modules:
  `profile-dialog` → `assessmentQueries`; app-review and payout/banks already
  use feature queries.
- Converted notification read / read-all to optimistic mutation hooks with
  rollback.
- Added `AbortSignal` support to `listPlayerSessions` and `listRooms`.
- Renamed the venue cache key to `queryKeys.venue.detail(id)` everywhere that
  invalidates it.
- Kept `eslint.config.js` untouched; invalidation hygiene is checked with the
  CI-style grep documented below.

### Phase 1 — Venue workspace

- `src/features/venue/api/venue.queries.ts` now owns the venue bundle,
  reservations, branch summary, payout and bank queries plus all venue write
  hooks.
- `useVenueData(venueId)` reads the bundle query and returns the derived
  schedule/customer/block helpers. The venue data/workspace providers are no
  longer part of the tree.
- `useVenueReservations(venueId)` selects reservations from the same bundle and
  polls every 10 s **once**, in the venue layout.
- Reservation approve/decline is optimistic in the bundle cache and rolls back
  on failure; the previous component-local `decisions` overlay was removed.
- Walk-in/customer/block/court mutations invalidate or patch the bundle so
  additions appear immediately. The refund queue no longer keeps a local
  `done` set; it awaits a bundle refetch after the refund is recorded.
- Admin app-review and discount rows are read directly from their query props;
  the duplicate local row copies were removed.

### Phase 1.5 — Booking wizard and expiry

- `src/features/booking/state/booking-draft.tsx` is a UI-only provider for the
  wizard fields; it no longer holds sessions or server data.
- `src/features/booking/hooks/use-booking-wizard.ts` combines the draft with
  `sessionQueries.mine()`, pure conflict helpers and the hold mutation.
  `paying` is `createHold.isPending`.
- `src/features/booking/api/booking.queries.ts` (named `queries` rather than
  `mutations`, per §14.2) awaits both `POST /api/bookings` and the session
  `PUT`, then writes the returned session into the sessions cache and
  invalidates so the server-derived view wins.
- `createHold` is idempotent on the slot in the API; the reload/retry test is
  `api/test/bookings-service.test.ts` (`createHold returns the same unpaid hold
  on a retry`).
- Expiry is now a derived read view (`deriveExpiries` / `applyExpiryView` /
  `deriveExpiredEvents` in `matchmaking-derive.ts`) plus the player-only
  `SessionExpiryWatcher`. The client no longer runs a cache-mutating sweep. The
  API filters expired requests/invites on read and refuses to approve an
  expired request; its shared TTL helpers live in `api/src/shared/helpers.ts`
  and the web copy.

### Phase 2 — Player sessions and matchmaking

- Added `sessionQueries.mine()` / `sessionQueries.rooms()` with 30 s polling,
  window-focus refetch and `initialData` from the seed snapshot in the two
  consumers that need it (`useSessionData`, `useBookingWizard`).
- Added pure derive functions and tests in
  `src/features/play/lib/matchmaking-derive.ts` / `.test.ts`.
- Replaced `session.tsx` (2,200+ lines) with:
  - `hooks/use-session-data.ts` — query data + derived projections;
  - `hooks/use-session-actions.ts` — mutation orchestration;
  - `state/session-ui.tsx` — active room, dialogs, local join bookkeeping,
    expiry notifications and clock tick.
- Added mutation hooks for save/join/decide/leave/disband/cancel/mark-paid.
  Join, room approve/decline and leave/disband invalidate the exact session and
  room keys; join/approve/decline use optimistic cache transforms with
  rollback.
- Added `SessionRealtime`; room/session subscriptions only mount in the player
  workspace, while the notification channel remains global.
- `ROOMS_CHANGES_CHANNEL` invalidates `sessions`, `rooms` and `notifications`,
  because a join request writes the host's session document without a personal
  session publication.

### Phase 3 — Notifications and assessment

- Notification rows come from `notificationQueries.list()` (10 s fallback
  poll). `readLocal` is only for client-only expiry items; server rows use the
  optimistic read mutations and roll back on failure.
- Assessment has one source of truth in React Query
  (`assessmentQueries.assessment()` + `useSaveAssessment`). The localStorage
  copy and the assessment sync event/effect were removed.
- `PlayerAssessmentGate` is now query + `Navigate`, with no readiness/effect
  dance. Venue-only and admin exemptions are preserved.

### Phase 4 — DataProvider and seed

- `LocationProvider` owns geolocation and never prompts on mount; only an
  explicit "near me" action requests permission.
- `DataProvider` is retained as the derived-seed provider recommended by the
  §6.8 review caution: it reads the query itself, owns no mutable copy, and
  gives every consumer stable bound helpers. `DataContextValue` was trimmed of
  dead fields.
- The legacy `Seed` shape and `/api/seed` were intentionally **not** trimmed:
  the old `web/` app still consumes those fields. Trim them only after that app
  is removed and the API/shared-type change is coordinated.

### Phase 5 — Facades and dead code

- Deleted `session.tsx`, `matchmaking.tsx`, `booking.tsx`, the query-client
  singleton, and the `useSession` / `useMatchmaking` / `useBooking` facades.
- All callers use the narrow hooks (`useSessionData`, `useSessionActions`,
  `useBookingWizard`, mutation hooks).
- `QueryClient` is created inside `getRouter()` and supplied to the router
  context; feature code uses `useQueryClient()`.
- Admin actions and onboarding are query/mutation hooks rather than direct
  cache-singleton calls.
- Removed the unused `usePersistSession` / `useForgetSession` hooks.
- Regenerated `routeTree.gen.ts` after the route changes.

## Acceptance criteria

| Criterion | Status | Evidence |
| --- | --- | --- |
| No context value contains sessions/crossRooms/reservations/customers/blocks/notifications arrays | Pass (static) | Context inspection; only derived helpers in `DataProvider`. |
| No provider calls `fetch`, `listRooms`, `listPlayerSessions`, `fetchVenueReservations` | Pass (static) | Providers are UI-only; reads are query hooks. |
| No `useState(seed.*)` for server records | Pass (static) | No matches. |
| No `invalidateQueries()` without a key | Pass (static) | No matches. |
| One query per resource | Pass by design | All reads use the centralized keys; venue bundle/reservations share one key. Not re-measured in React Query devtools. |
| One request per polling loop | Not measured | Query keys are shared and the venue poll is layout-level; browser network panel check remains for QA. |
| Every Centrifugo subscription through `useChannelInvalidation`; no data window events | Pass (static) | No direct `subscribeToChannel` outside `src/lib/realtime.ts`; no `ROOMS_CHANGED_EVENT` / assessment event. |
| Venue block/walk-in/customer appears immediately; second tab after poll | Code path verified | Bundle mutation/invalidation and 10 s layout poll. Manual two-tab QA not run. |
| Join/approve/decline/cancel including rollback | Code + unit tests | Pure optimistic transforms covered; mutation wiring typechecks. Manual QA not run. |
| Vietnamese copy and flows unchanged | Pass (static) | No `messages/vi.json` changes; copy and route structure preserved. Browser QA not run. |
| `pnpm typecheck`, `pnpm lint`, `pnpm test` pass | Pass | Results below. |

## Verification results

### `web-shuttio`

```text
pnpm typecheck  # pass
pnpm lint       # 0 errors, 524 warnings
pnpm test       # 9 files, 77 tests passed
pnpm build      # pass; prerendered / and /app
```

The build emits the known non-fatal Rolldown `MODULE_LEVEL_DIRECTIVE` warnings
for third-party `"use client"` modules and falls back from port 3000 when it is
already in use.

### `api`

```text
pnpm typecheck  # pass
pnpm lint       # pass
pnpm test       # 383 tests: 372 pass, 11 skipped, 0 fail
```

### Repository hygiene

```text
git diff --check  # clean
```

Static acceptance greps (run from `web-shuttio/`):

```text
invalidateQueries()                        0
useState(seed...                        0
direct subscribeToChannel outside realtime 0
stale facade/event/singleton imports       0
```

## Manual QA

The following scenarios from §8/§15.1 are **not run** here because this
environment has no signed-in browser session or browser-automation surface.
They must be run against `docker compose up --build --watch` with the dev
player and venue accounts before release:

| Scenario | Status |
| --- | --- |
| Venue approve/decline; add walk-in/customer/block; second tab after poll | Not run |
| Book → payment screen; reload and pay again → same hold; cancel before proof | Not run (API idempotency test passes) |
| Two-tab rooms: create → request → approve; member updates without reload; leave | Not run |
| Expiry: request past TTL disappears, stays gone after reload, host cannot approve | Not run (API/derive tests pass) |
| Notification approval appears in bell; read survives navigation | Not run |
| Fresh player assessment gate; save reaches dashboard | Not run |
| Stop API: error screen shows "Thử lại"; restart and recover | Not implemented; no route error boundary yet |
| Vietnamese copy/toasts and duplicate polling/network checks | Not run |

## Deviations and known gaps

1. **`DataProvider` retained.** The §6.8 review caution wins over the earlier
   Phase 4 instruction to delete it. It derives from the seed query, owns no
   mutable records, and avoids per-consumer helper-identity churn.
2. **Legacy seed fields retained.** `web/` still consumes them; only
   `DataContextValue` was trimmed. Trim `Seed`/`/api/seed` after the old app is
   removed.
3. **`useSaveSession` remains optimistic.** Forming-room creation needs the
   instant cache insert; this is the intentional exception to the
   wait-then-refetch default. Failures roll the cache back.
4. **`useCreateBookingHold` writes the returned session and then invalidates.**
   This follows §13.1's server-truth requirement; it is the one place where
   §14.2 rule 3's "don't do both" is intentionally not applied.
5. **Rooms realtime invalidates sessions too.** This is deliberate: join
   requests update the host's session document and have no personal-session
   publication of their own.
6. **Player-only session runtime.** Session/room channels and the expiry
   watcher are mounted only in the player workspace; the notification channel
   remains global for the operator/admin bell.
7. **UI-provider state count.** The two UI providers still use 16 `useState`
   calls (9 session UI + 7 booking draft), all UI-only. The §14.4 target was
   ≤12; no server data is involved, but the numeric target is not fully met.
8. **Phase 0 safety nets deferred.** No MSW/RTL hook tests, no default/route
   error boundary, and `wellFormedRooms()` remains in place of the proposed zod
   room schema. These were not part of the §9 acceptance gate; they remain the
   next hardening work.
9. **Silent save failures.** `useSaveSession` rolls back but does not add a new
   Vietnamese error toast; the previous provider swallowed these failures. Add
   copy/toast in `useSessionActions` if the visible failure path is required.
10. **Manual browser QA is outstanding.** No claim of a passing end-to-end
    demo is made in this handoff.

## Recommended follow-ups

1. Run the manual QA matrix above, including two-tab realtime and reconnect
   catch-up.
2. Add the Phase 0 error boundary and, once a component-test harness exists,
   MSW/RTL mutation tests.
3. Replace `wellFormedRooms()` with the zod room guard at the query boundary.
4. If the §14.4 metric is enforced, collapse the booking-draft fields and
   dialog flags into smaller UI state objects (no server-data change).
5. Add the save-session failure toast and, if profiling shows it, a dedicated
   reservations endpoint / venue realtime channel.
6. Remove the legacy seed fields and the old `web/` app together.
