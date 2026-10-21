import { queryOptions } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"
import type { PlayerAssessment } from "@/lib/shared"
import { playerSkillLevels } from "@/features/assessment/api/assessment-api"
import { playerRatingSummary } from "@/features/chat/api/group-api"

/** Reads owned by the player skills assessment. */
export const assessmentQueries = {
  /** The signed-in player's persisted skills assessment (null until taken). */
  assessment: () =>
    queryOptions({
      queryKey: queryKeys.assessment(),
      queryFn: ({ signal }) =>
        api<PlayerAssessment | null>("/api/assessment", { signal }),
    }),

  /** Another player's assessed level per sport (empty until they take it). */
  playerLevels: (userId: string) =>
    queryOptions({
      queryKey: queryKeys.assessmentLevels(userId),
      queryFn: () => playerSkillLevels(userId),
    }),

  /** Another player's rating summary, shown on their profile. */
  playerReviews: (userId: string) =>
    queryOptions({
      queryKey: queryKeys.ratings(userId),
      queryFn: () => playerRatingSummary(userId),
    }),
}
