import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"

import { routeTree } from "./routeTree.gen"
import { getContext } from "./lib/query-client"
import { RouteLoading } from "@/components/layouts/route-loading"
import { NotFound } from "@/components/layouts/not-found"

export function getRouter() {
  const context = getContext()

  const router = createTanStackRouter({
    routeTree,
    context,
    scrollRestoration: true,
    defaultPreload: "intent",
    // Query owns caching; the router just triggers `ensureQueryData`.
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: RouteLoading,
    defaultNotFoundComponent: NotFound,
  })

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
