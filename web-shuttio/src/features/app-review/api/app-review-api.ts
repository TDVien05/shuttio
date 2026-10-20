import type { MyAppReview } from "@/lib/shared"
import { api } from "@/lib/api"
import { queryClient } from "@/lib/query-client"

// Client calls for the signed-in user's review of the app itself
// (`api/src/features/app-reviews/`). Saving refreshes the landing's reviews so a
// new featured quote shows up right away.

/** The caller's own review, or null if they haven't left one yet. */
export async function getMyAppReview(): Promise<MyAppReview | null> {
  return api<MyAppReview | null>("/api/app-reviews/me")
}

/** Create or edit the caller's review. */
export async function saveAppReview(input: {
  rating: number
  comment: string
}): Promise<MyAppReview> {
  const saved = await api<MyAppReview>("/api/app-reviews/me", {
    method: "PUT",
    body: input,
  })
  void queryClient.invalidateQueries({ queryKey: ["app-reviews"] })
  return saved
}
