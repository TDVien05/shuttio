# web → web-shuttio migration status

Branch: `feat/tanstack-start-migration`. `web/` is untouched until the port is
done and deletion is approved.

## Done

1. **Foundation**: TanStack Start (only `/` is prerendered to `index.html`;
   every other route is client-only via the root route's `ssr` gate, served the
   `_shell.html` SPA loading shell — the `/app` entry in the build log is that
   shell, not server-rendered page content), React Query with the browser api client
   (`src/lib/api.ts`, Clerk bearer token), Clerk (`@clerk/react`, vi), Paraglide
   (`messages/vi.json`, flat snake_case keys, Vietnamese only), shadcn
   `aria-luma` (React Aria), TanStack Form kit (`src/components/form.tsx`).
2. **Landing + auth**: landing page, sign-in/up, forgot password, admin sign-in,
   SSO callback.
3. **Player dashboard**: play, find courts, rooms, booking wizard, bookings,
   VietQR payment, onboarding, assessment, notifications, profile, app review.
4. **Venue workspace**: command, schedule, courts, customers, insights, manage,
   setup wizard; tables on TanStack Table v9 (`src/lib/table.ts`). All venue
   forms (`PayoutEditor`, setup wizard brand/branch steps, `ReasonDialog`, court,
   customer and walk-in forms) run on `useAppForm` + zod schemas.
5. **Admin workspace**: overview, venues, bookings, refunds, approvals,
   discounts, reviews, complaints; routes in
   `src/routes/_authenticated/app/admin/*`, `adminQueries.*()` options, TanStack
   Table v9 sortable tables.
6. **AI assistant (`/app` index)**: ported `AiNativeDashboardView` and
   `DashboardWelcome` preserving the exact original layout and art illustrations.
   Powered by `@shadcn/helpers/ai-sdk` and `@ai-sdk/react`, with reasoning and
   in-flight tool indicators rendered with shadcn **Trace** (`src/components/ui/trace.tsx`).
7. **Domain-module structure**: routes are thin; each product area lives under
   `src/features/<domain>/` with `api/`, `components/`, `hooks/`, `lib/`,
   `schemas/` and `types/`. Shared UI is in `src/components/{ui,layouts}`,
   cross-cutting infra in `src/lib`, and global CSS in `src/styles`. The
   `_signed-in` pathless layout is now `_authenticated` (URLs unchanged). See
   `README.md` for the full tree.
8. **Docker**: `web-shuttio` Compose service plus a multi-stage Dockerfile — a
   `dev` target for Compose Watch and a `production` target running the Nitro
   node server (`node .output/server/index.mjs`). The service publishes :3001
   (Next.js keeps :3000), and the api's `WEB_URL` is a comma-separated CORS
   allow-list so both frontends run side by side. Production builds take the
   `VITE_*` values as build args.

Checks at each commit: `pnpm typecheck`, `pnpm lint` (0 errors), `pnpm test`,
`pnpm build`.

## Layout parity

The shell (sidebar, topbar, `DashboardFrame`), auth/setup/onboarding/assessment/
venue/admin layouts, route wrappers and the venue/admin page tables were audited
against `web/`; the rendered layout is unchanged. Class-level differences are
limited to:

- Theme tokens instead of arbitrary values (`text-[10px]` → `text-micro`,
  `text-[11px]` → `text-mini`, `max-w-[220px]` → `max-w-55`, …), defined in
  `src/styles/globals.css`.
- `Button shape="pill"` instead of repeating `rounded-full`, and the shared
  `Table` `density`/`align`/`tone`/`weight`/`numeric` variants instead of
  repeated cell/head class lists.
- React Aria primitives (Dialog/Sheet/Select/Dropdown) own different internal
  markup than the Radix versions in `web/`; the outer layout is preserved.
- Chat/locale controls and nav badges are intentionally absent (see below).

## Remaining

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

- Chat is rebuilt on the api's own MongoDB chat + Centrifugo instead of Stream
  Chat (`src/features/chat/`, `/api/chat/*`); pictures are private Cloudinary
  uploads. The legacy `web` app still targets Stream and no longer works
  against this api.
- Web-side demo/seed data is removed (demo room titles, demo notifications and
  booking day labels, the static nav badge).
- Live updates (rooms, sessions, notifications, chat) arrive over Centrifugo
  (`src/lib/realtime.ts`); the SSE endpoints and Next proxy routes are gone.
- Mutations are client modules (`features/*/api/*-api.ts`, same names as the
  old server actions) that invalidate React Query keys instead of
  `revalidatePath`.
- **No server functions / `src/server/`**: the NestJS `api/` app remains the
  backend; this app calls it directly from the browser with the Clerk token.
  There is no app-local DB, auth middleware or service layer to host.
- **Framework layout**: kept `src/` (the Vite-based Start default) rather than
  the reference's root `app/`; there is no `app.config.ts`, `client.tsx` or
  `ssr.tsx` in this version — `vite.config.ts`, `src/start.ts` and
  `src/router.tsx` fill those roles.
- **Auth/admin route names**: `_auth` stays a TanStack pathless _layout_ (the
  reference's `(auth)` is a route group and cannot own a layout). `_signed-in`
  became `_authenticated`.
- **Schemas**: auth schemas are shared in `features/auth/schemas/`; single-use
  venue form schemas stay colocated with their form until reused.

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
