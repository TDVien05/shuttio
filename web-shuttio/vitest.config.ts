import { defineConfig } from "vitest/config"

// Unit tests only need path aliases — not the Start/Nitro/Paraglide plugins
// from vite.config.ts (which keep dev servers alive and hang the run).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: { include: ["src/**/*.test.ts"] },
})
