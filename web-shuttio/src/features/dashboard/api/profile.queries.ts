import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query"

import { queryKeys } from "@/lib/query-keys"
import {
  playerRatingSummary,
  playerReviewPage,
} from "@/features/chat/api/group-api"

/** Reads shown on a player's profile dialog. */
export const profileQueries = {
  /** A player's peer-rating summary (average and count). */
  playerReviews: (userId: string) =>
    queryOptions({
      queryKey: queryKeys.ratings(userId),
      queryFn: () => playerRatingSummary(userId),
    }),
  /** A player's reviews, newest first — loaded a page at a time on scroll. */
  playerReviewPages: (userId: string) =>
    infiniteQueryOptions({
      queryKey: queryKeys.ratingReviews(userId),
      queryFn: ({ pageParam }) => playerReviewPage(userId, pageParam),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor,
    }),
}
