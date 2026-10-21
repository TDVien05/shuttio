import { Suspense, lazy } from "react"
import type { QueryClient } from "@tanstack/react-query"
import type { ErrorComponentProps } from "@tanstack/react-router"
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
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { m } from "@/paraglide/messages"
import appCss from "../styles/globals.css?url"

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  ssr: ({ location }) => location.pathname === "/",
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
  errorComponent: RootErrorComponent,
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

function RootErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const handleRetry = () => {
    // Clear query cache errors so fresh requests are fired on retry
    router.options.context.queryClient.clear()
    void router.invalidate().finally(() => reset())
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-stage-glow-tl p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{m.root_error_title()}</CardTitle>
          <CardDescription>
            {error instanceof Error
              ? error.message
              : m.root_error_description()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button onClick={handleRetry}>{m.root_error_retry()}</Button>
            <Button
              variant="outline"
              onClick={() => void router.navigate({ href: "/" })}
            >
              {m.root_error_home()}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
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
