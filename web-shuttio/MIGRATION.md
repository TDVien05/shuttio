# web → web-shuttio migration status

Branch: `feat/tanstack-start-migration`. `web/` is untouched until the port is
done and deletion is approved.

## Done

1. **Foundation**: TanStack Start (prerendered `/`, SPA shell elsewhere via
   `defaultSsr: false`), React Query with the browser api client
   (`src/lib/api.ts`, Clerk bearer token), Clerk (`@clerk/react`, vi), Paraglide
   (`messages/vi.json`, flat snake_case keys, Vietnamese only), shadcn
   `aria-luma` (React Aria), TanStack Form kit (`src/components/form.tsx`).
2. **Landing + auth**: landing page, sign-in/up, forgot password, admin sign-in,
   SSO callback.
3. **Player dashboard**: play, find courts, rooms, booking wizard, bookings,
   VietQR payment, onboarding, assessment, notifications, profile, app review.
4. **Venue workspace**: command, schedule, courts, customers, insights, manage,
   setup wizard; tables on TanStack Table v9 (`src/lib/table.ts`).

Checks at each commit: `pnpm typecheck`, `pnpm lint` (0 errors), `pnpm test`,
`pnpm build`.

## Remaining

- [ ] **Admin workspace**: port `web/features/admin/*` (overview, venues,
  bookings, refunds, approvals, discounts, reviews, complaints). Route stubs
  are in `src/routes/_signed-in/app/admin/*` (they render `null`). `admin-api.ts`,
  `admin-types.ts`, `nav.ts` and `pagination.tsx` are already ported. Add
  `queries.admin*()` (key `["admin", …]`). Admin tables use TanStack Table v9
  with `sortableTable`. Use the codemods described below.
- [ ] **AI assistant (`/app` index)**: currently a stub
  (`src/routes/_signed-in/app/index.tsx`). Port
  `web/features/chat/ai-native-dashboard.tsx` and
  `web/features/dashboard/dashboard-welcome.tsx` on AI SDK v7
  (`ai`, `@ai-sdk/react` are installed). Replace the reasoning/tool/source UI
  with shadcn **Trace** (`src/components/ui/trace.tsx`, already added) and add
  the AI elements: `pnpm dlx shadcn@latest add message message-scroller marker`.
  The api streams from `POST /api/ai/chat` and still uses `ai` v6, so check the
  UI-message stream compatibility (or bump the api). The welcome screen's
  "recent chats" depend on Stream, so drop them (chat is unavailable). Also
  delete its hardcoded demo `players` list.
- [ ] **Remaining forms on local state**: `PayoutEditor`
  (`features/venue/payout-fields.tsx`), the setup wizard steps
  (`features/venue/setup-wizard.tsx`), `ReasonDialog`
  (`features/venue/shared.tsx`), and the venue manage edit dialog. Move them to
  `useAppForm` with a zod schema in the same file.
- [ ] **Docker Compose**: add a `web-shuttio` service plus Dockerfile building the
  Nitro node server (`pnpm build` → `node .output/server/index.mjs`), with dev
  via Compose Watch like the existing `web` service. `VITE_*` vars are
  build-time, so pass them as build args. Point the api's `WEB_URL` at the new
  origin for CORS.
- [ ] **Runtime smoke test**: run the api plus `pnpm dev`, sign in, and click
  through the player, venue and admin flows. Only static checks have run so far.
  Watch for React Aria behaviour differences (Select/ComboBox keys,
  popover placement, Tabs `data-selected`, tooltips on heatmap cells).
- [ ] **Message catalog cleanup**: delete keys that nothing references any more
  (e.g. grep each `m.<key>` across `src`), and normalize index-style keys
  (`landing_faq_0_question`) if wanted.
- [ ] **Docs**: update the root `CLAUDE.md` and `README.md` for web-shuttio; on
  approval, delete `web/` and its compose service.

## Intentional differences from web

- Chat (Stream) is **unavailable**: `/app/chat` and the venue messages page show
  `ChatUnavailable`. "Open chat" buttons link there; `stream-chat` is not installed.
- Web-side demo/seed data is removed (demo room titles, demo notifications and
  booking day labels, the static nav badge).
- SSE (rooms/sessions events) goes straight to the api with
  `@microsoft/fetch-event-source` (`src/lib/events.ts`); the Next proxy routes
  are gone.
- Mutations are client modules (`features/*/*-api.ts`, same names as the old
  server actions) that invalidate React Query keys instead of `revalidatePath`.

## Porting toolkit

The codemods live outside the repo (in the session scratchpad). Their rules, if
you need to reapply them by hand:

- `t("a.b", args)` → `m.ns_a_b(args)`; template keys → a typed lookup map;
  never a `t()` shim.
- Button `onClick`/`disabled` → `onPress`/`isDisabled`; DropdownMenuItem
  `onClick` → `onAction` (or `href`); `render={<Link/>}` → `LinkButton href`.
- `Dialog`+`DialogContent` → `<Dialog isOpen onOpenChange className>`;
  `XTrigger render={…}` → `<XTrigger><Button/>…<X/></XTrigger>`.
- Tabs `value`/`onValueChange` → `selectedKey`/`onSelectionChange`, `data-active:`
  → `data-selected:`. Select `onValueChange` → `onChange` (Key | null), items use
  `id`, and `<SelectValue />` renders the selected item.
- Keep the default TanStack eslint config. Only `src/components/ui` and
  `src/components/kibo-ui` are ignored.
