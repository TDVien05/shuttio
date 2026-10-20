import { QueryClient } from "@tanstack/react-query"

import { ApiError } from "@/lib/api"

export function getContext() {
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

  return { queryClient }
}
