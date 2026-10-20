import { queryOptions } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { PlayerAssessment } from "@/lib/shared"

/** Reads owned by the player skills assessment. */
export const assessmentQueries = {
  /** The signed-in player's persisted skills assessment (null until taken). */
  assessment: () =>
    queryOptions({
      queryKey: ["assessment"],
      queryFn: ({ signal }) =>
        api<PlayerAssessment | null>("/api/assessment", { signal }),
    }),
}
