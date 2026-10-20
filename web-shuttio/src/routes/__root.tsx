import { Suspense, lazy } from "react"
import type { QueryClient } from "@tanstack/react-query"
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useLocation,
  useRouter,
} from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"
import { RouterProvider } from "react-aria-components"

import TanStackQueryDevtools from "../components/devtools"
import { ThemeProvider } from "@/components/theme-provider"
import { RouteLoading } from "@/components/layouts/route-loading"
import { m } from "@/paraglide/messages"
import appCss from "../styles/globals.css?url"

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: m.meta_title_default() },
      { name: "description", content: m.meta_description() },
      { name: "keywords", content: m.meta_keywords() },
      { property: "og:title", content: m.meta_og_title() },
      { property: "og:description", content: m.meta_og_description() },
      { property: "og:site_name", content: "Shuttio" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: m.meta_twitter_title() },
      { name: "twitter:description", content: m.meta_twitter_description() },
      // Light-only product: keep the browser chrome light even when the OS
      // prefers a dark color scheme.
      { name: "theme-color", content: "#ffffff" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/logo.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/logo.svg" },
    ],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
})

const ClerkProvider = lazy(() => import("@/components/clerk-provider"))

function RootComponent() {
  const router = useRouter()
  const isLanding = useLocation({ select: (l) => l.pathname === "/" })

  return (
    // React Aria links (LinkButton, menu items, …) navigate client-side.
    <RouterProvider
      navigate={(href, options) => router.navigate({ ...options, href })}
      useHref={(href) => href}
    >
      {isLanding ? (
        <Outlet />
      ) : (
        <Suspense fallback={<RouteLoading />}>
          <ClerkProvider>
            <Outlet />
          </ClerkProvider>
        </Suspense>
      )}
    </RouterProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className="font-sans antialiased"
    >
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        {import.meta.env.DEV && (
          <TanStackDevtools
            config={{ position: "bottom-right" }}
            plugins={[
              {
                name: "Tanstack Router",
                render: <TanStackRouterDevtoolsPanel />,
              },
              TanStackQueryDevtools,
            ]}
          />
        )}
        <Scripts />
      </body>
    </html>
  )
}

declare module "react-aria-components" {
  interface RouterConfig {
    routerOptions: { replace?: boolean; resetScroll?: boolean }
  }
}
