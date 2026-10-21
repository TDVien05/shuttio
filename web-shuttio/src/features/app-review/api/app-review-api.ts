import type { MyAppReview } from "@/lib/shared"
import { api } from "@/lib/api"

// Raw calls for the signed-in user's review of the app itself
// (`api/src/features/app-reviews/`). Invalidation lives in the mutation hooks
// in `app-review.queries.ts`.

/** The caller's own review, or null if they haven't left one yet. */
export async function getMyAppReview(): Promise<MyAppReview | null> {
  return api<MyAppReview | null>("/api/app-reviews/me")
}

/** Create or edit the caller's review. */
export async function saveAppReview(input: {
  rating: number
  comment: string
}): Promise<MyAppReview> {
  return api<MyAppReview>("/api/app-reviews/me", {
    method: "PUT",
    body: input,
  })
}
