import type { QueryClient } from "@tanstack/react-query"
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"
import { ClerkProvider } from "@clerk/react"
import { viVN } from "@clerk/localizations"
import { RouterProvider } from "react-aria-components"

import TanStackQueryDevtools from "../integrations/tanstack-query/devtools"
import { ThemeProvider } from "@/components/theme-provider"
import { CLERK_PUBLISHABLE_KEY } from "@/env"
import { m } from "@/paraglide/messages"
import appCss from "../styles.css?url"

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
      {
        name: "theme-color",
        media: "(prefers-color-scheme: light)",
        content: "#ffffff",
      },
      {
        name: "theme-color",
        media: "(prefers-color-scheme: dark)",
        content: "#0a0a0a",
      },
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

function RootComponent() {
  const router = useRouter()

  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      localization={viVN}
      routerPush={(to) => router.navigate({ href: to })}
      routerReplace={(to) => router.navigate({ href: to, replace: true })}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/app"
      signUpFallbackRedirectUrl="/app"
      afterSignOutUrl="/"
    >
      {/* React Aria links (LinkButton, menu items, …) navigate client-side. */}
      <RouterProvider
        navigate={(href, options) => router.navigate({ ...options, href })}
        useHref={(href) => href}
      >
        <ThemeProvider>
          <Outlet />
        </ThemeProvider>
      </RouterProvider>
    </ClerkProvider>
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
        {children}
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
