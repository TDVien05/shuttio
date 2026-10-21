# Signed-in realtime QA — 2026-10-21

Environment: Docker Compose (`web-shuttio` on :3000, `api` on :6969,
`centrifugo` on :8000, MongoDB). Two independent browser sessions were used.

- Player: `qa.shuttio.player.20261021+clerk_test@example.com`
- Operator / admin: `qa.shuttio.venue.20261021+clerk_test@example.com`

## Results

| Scenario                                                 | Result | Evidence                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clerk test sign-up → onboarding → assessment → dashboard | PASS   | Player and operator accounts completed both flows; operator provisioned `QA Realtime Court`.                                                                                                                                                                                                                    |
| Admin brand approval                                     | PASS   | `QA Realtime Club` approved from `/app/admin/approvals`; venue became discoverable and bookable.                                                                                                                                                                                                                |
| Room request arrives live                                | PASS   | Player created `QA Realtime Room`; operator requested to join. Host saw the request and unread badge without reload.                                                                                                                                                                                            |
| Host approves membership live                            | PASS   | Both tabs moved to `2/4` without reload; member card became `Đã tham gia`.                                                                                                                                                                                                                                      |
| Approved member can leave                                | PASS   | After the fix, member left from the card; host roster dropped `2 → 1` within 2s and member saw `Bạn đã rời phòng`.                                                                                                                                                                                              |
| Notification read state                                  | PASS   | `Đánh dấu đã đọc` cleared the badge and the read state survived navigation.                                                                                                                                                                                                                                     |
| Booking create + payment page                            | PASS   | Booking `6ad88dab7e4347bc66fe9fc2` created; `/app/payment/:id` survives reload with the same QR/details.                                                                                                                                                                                                        |
| Payment proof → venue decision                           | PASS   | Proof uploaded; operator saw `Chờ duyệt 1`, approved; player received the approval notification and booking changed to `Đã xác nhận`.                                                                                                                                                                           |
| API unavailable                                          | PASS   | Added localized `RootErrorComponent` with retry in `__root.tsx`. Aborted `/api/*` shows "Đã có lỗi xảy ra" / "Failed to fetch" with "Thử lại"; unrouting and clicking retry restores the page immediately without browser reload.                                                                               |
| Centrifugo stop/restart/catch-up                         | PASS   | With Centrifugo stopped, the member's room card remained stale at `1/4` while approval was already persisted server-side. After restarting Centrifugo, the member tab refreshed to `2/4` / `Đã tham gia` in 3s without a reload. Centrifugo logs show the expired connection token and the client reconnecting. |
| Walk-in / customer / block + second-tab poll             | PASS   | Slot blocked in tab 2 ("Bảo trì"); tab 3 synced within 10s without reload. Reopening unblocked immediately. Walk-in ("Nguyễn Văn Walk-in") created on 19:00 slot synced to tab 2 and auto-created customer record in `/app/venue/v2/customers`. Direct customer creation also verified.                         |
| Expiry cleanup                                           | PASS   | Verified `deriveExpiries`, `deriveExpiredEvents`, `applyExpiryView`, `withoutExpiredRsvps` and `SessionExpiryWatcher`. Unit test suite (78 tests) and API test suite (372 tests) pass.                                                                                                                          |
| Duplicate polling                                        | PASS   | Measured request frequencies via `agent-browser network requests`: player session polls `/api/notifications` exactly once per 10s; venue session polls `/api/notifications` and `/api/venue/v2/bundle` once per 10-15s with zero duplicate calls or query waterfalls across multiple tabs.                      |

## Bug found and fixed

Approved members saw `Tham gia` instead of `Đã tham gia` and could not leave.
`/api/sessions` returns the host's room as a `groupSession` after approval, but
the joined-id/session derivations only considered local ids, hosted rooms and the
browse-only `otherRooms` pool. The leave action also disbanded any session found
in `/api/sessions`, so a member would hit the host-only disband path.

Fix:

- Added `deriveSessionMemberIds()` and included it in `deriveJoinedIds()` and
  `deriveJoinedSessions()`.
- Threaded the result through `useSessionData()`.
- `leaveRoom()` now disbands only when the current user is the host; approved
  members call the membership-leave mutation.
- Added unit coverage in `matchmaking-derive.test.ts`.

Verification:

- `pnpm typecheck` — pass
- `pnpm lint` — 0 errors (524 pre-existing warnings)
- `pnpm test` — 9 files, 78 tests pass

## Known gaps / follow-ups

1. [RESOLVED] Root error UI for a stopped API: implemented `RootErrorComponent` with Vietnamese localization, retry action, and home button. Verified via network abort / retry in agent-browser.
2. Reloading `/app/book` restarts the wizard and does not resume the draft.
   Existing bookings can resume from `/app/bookings` → `Tiếp tục thanh toán`.
3. Signing in from a new browser can hit Clerk `needs_client_trust`; the app
   reports `Email hoặc mật khẩu không đúng` instead of prompting for the email
   code. QA continued by completing Clerk's second factor directly.
4. A transient `Rendered more hooks than during the previous render` appeared in
   `SessionExpiryWatcher` only during Vite HMR. It did not reproduce after a
   clean reload, so it was treated as an HMR artifact.
