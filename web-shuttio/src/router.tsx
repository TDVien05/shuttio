import { QueryClient } from "@tanstack/react-query"
import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"

import { routeTree } from "./routeTree.gen"
import { ApiError } from "@/lib/api-error"
import { RouteLoading } from "@/components/layouts/route-loading"
import { NotFound } from "@/components/layouts/not-found"

export function getRouter() {
  // One client per router instance (per request on the server, once in the
  // browser). Feature code reaches it through `useQueryClient()`.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // A 4xx won't fix itself on retry (auth, not-found, validation).
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status < 500) &&
          failureCount < 2,
      },
    },
  })

  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    // Query owns caching; the router just triggers `ensureQueryData`.
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: RouteLoading,
    defaultNotFoundComponent: NotFound,
  })

  setupRouterSsrQueryIntegration({ router, queryClient })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
