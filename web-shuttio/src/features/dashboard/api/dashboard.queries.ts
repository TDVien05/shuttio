import { queryOptions } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { Seed } from "@/lib/shared"

/** Reads owned by the player dashboard shell. */
export const dashboardQueries = {
  /**
   * The signed-in player's aggregate dashboard payload (`GET /api/seed`) —
   * every `/app` screen reads it through `useData()`.
   */
  seed: () =>
    queryOptions({
      queryKey: ["seed"],
      queryFn: ({ signal }) => api<Seed>("/api/seed", { signal }),
    }),
}
