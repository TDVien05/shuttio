import type { PlayerAssessment, PlayerSkillLevel } from "@/lib/shared"

import { api } from "@/lib/api"

// Mirrors a player's completed skills assessment to the Hono API so it
// persists to MongoDB (per Clerk user). React Query owns the client copy; this
// module only performs the request.

/** Another player's assessed level per sport (empty until they take it). */
export async function playerSkillLevels(
  userId: string
): Promise<PlayerSkillLevel[]> {
  return api<PlayerSkillLevel[]>(
    `/api/assessment/users/${encodeURIComponent(userId)}/levels`
  )
}

/** Persist (insert or replace) the signed-in user's skills assessment. */
export async function saveAssessment(
  assessment: PlayerAssessment
): Promise<PlayerAssessment> {
  return api<PlayerAssessment>("/api/assessment", {
    method: "PUT",
    body: assessment,
  })
}
