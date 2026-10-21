import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"

import { api } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"
import type { AppReviewsPublic, MyAppReview } from "@/lib/shared"
import {
  getMyAppReview,
  saveAppReview,
} from "@/features/app-review/api/app-review-api"

/** Reads owned by the app-review feature. */
export const appReviewQueries = {
  /** The landing page's app-review summary (anonymous, `@Public()` route). */
  appReviewsPublic: () =>
    queryOptions({
      queryKey: queryKeys.appReviewsPublic(),
      queryFn: ({ signal }) =>
        api<AppReviewsPublic>("/api/app-reviews/public", {
          anonymous: true,
          signal,
        }),
      staleTime: 5 * 60_000,
    }),

  /** The caller's own review (null before they leave one). */
  mine: () =>
    queryOptions({
      queryKey: queryKeys.appReviewMe(),
      // A failed load just starts a fresh review; saving still upserts.
      queryFn: () => getMyAppReview(),
      retry: false,
    }),
}

/** Create/edit the caller's review, then refresh the public quotes. */
export function useSaveAppReview() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { rating: number; comment: string }) =>
      saveAppReview(input),
    onSuccess: (saved) => {
      queryClient.setQueryData<MyAppReview | null>(
        queryKeys.appReviewMe(),
        saved
      )
      void queryClient.invalidateQueries({
        queryKey: queryKeys.appReviewsPublic(),
      })
    },
  })
}
