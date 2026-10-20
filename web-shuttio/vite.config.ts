import { defineConfig } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import { paraglideVitePlugin } from "@inlang/paraglide-js"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react"
import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"
import { nitro } from "nitro/vite"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/paraglide",
      // Vietnamese only for now — no locale segment in URLs. Add "url" here
      // (and router rewrite hooks) once a second locale ships.
      strategy: ["baseLocale"],
    }),
    nitro({
      // The node server doesn't compress on the fly — ship .br/.gz siblings
      // of every public file and let Nitro pick one per `Accept-Encoding`.
      compressPublicAssets: { gzip: true, brotli: true },
      // HTML must revalidate so a deploy never serves a page pointing at
      // chunks that no longer exist. Hashed `/assets/**` keep Nitro's
      // default `immutable` year-long cache (the more specific rule wins).
      routeRules: { "/**": { headers: { "cache-control": "no-cache" } } },
    }),
    tailwindcss(),
    tanstackStart({
      // Only the landing page is static. `/app` is the SPA fallback route:
      // TanStack writes its masked shell to `_shell.html` (a loading state,
      // not rendered page content) and Nitro serves that file for every
      // client-side route. The root route's `ssr` gate (`__root.tsx`) renders
      // only `/`; children inherit that decision, so no other page can opt
      // into SSR.
      spa: {
        enabled: true,
        maskPath: "/app",
        prerender: { outputPath: "/_shell", crawlLinks: false },
      },
      pages: [{ path: "/", prerender: { enabled: true, crawlLinks: false } }],
    }),
    viteReact(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
})
