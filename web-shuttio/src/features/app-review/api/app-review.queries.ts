import { queryOptions } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { AppReviewsPublic } from "@/lib/shared"

/** Reads owned by the app-review feature. */
export const appReviewQueries = {
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
