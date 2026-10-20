# web-shuttio

The Shuttio web app on **TanStack Start** (Vite, React 19) — the successor of
`../web` (Next.js).

- **Landing page** (`/`) is prerendered to static HTML at build time.
- **Everything else** renders client-side (`defaultSsr: false` in
  `src/start.ts`) and calls the NestJS api directly from the browser with
  TanStack Query, attaching the Clerk session token (`src/lib/api.ts`).
- **Forms** use TanStack Form; **UI** is shadcn/ui on React Aria
  (`aria-luma`); **i18n** is Paraglide (`messages/vi.json`, Vietnamese only
  for now).

```bash
cp .env.example .env.local   # fill in VITE_CLERK_PUBLISHABLE_KEY
pnpm install
pnpm dev                     # http://localhost:3000
pnpm build                   # .output/ — static index.html + _shell.html SPA fallback
pnpm typecheck && pnpm lint
```
