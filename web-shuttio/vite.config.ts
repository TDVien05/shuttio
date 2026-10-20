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
    nitro(),
    tailwindcss(),
    tanstackStart({
      // Everything except the landing page renders client-side: the build
      // emits one SPA shell for the dashboard/auth routes and prerenders `/`
      // to static HTML. Routes opt into SSR individually (see `src/start.ts`).
      spa: { enabled: true, maskPath: "/app" },
      pages: [{ path: "/", prerender: { enabled: true, crawlLinks: false } }],
    }),
    viteReact(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
})
