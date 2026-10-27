import { queryOptions } from "@tanstack/react-query"

import { queryKeys } from "@/lib/query-keys"
import { playerRatingSummary } from "@/features/chat/api/group-api"

/** Reads shown on a player's profile dialog. */
export const profileQueries = {
  /** A player's peer-rating summary (average, count, newest reviews). */
  playerReviews: (userId: string) =>
    queryOptions({
      queryKey: queryKeys.ratings(userId),
      queryFn: () => playerRatingSummary(userId),
    }),
}
