import { queryOptions } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { AppReviewsPublic } from "@/lib/shared"

/**
 * Query options for every api read, keyed by resource. Components call
 * `useQuery(…)`/`useSuspenseQuery(…)` with these and mutations invalidate by
 * the same keys, so a write anywhere refreshes every screen showing the data.
 */
export const queries = {
  /** The landing page's app-review summary (anonymous, `@Public()` route). */
  appReviewsPublic: () =>
    queryOptions({
      queryKey: ["app-reviews", "public"],
      queryFn: ({ signal }) =>
        api<AppReviewsPublic>("/api/app-reviews/public", {
          anonymous: true,
          signal,
        }),
      staleTime: 5 * 60_000,
    }),
}
