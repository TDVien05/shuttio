import type { PlaySession } from "@/lib/shared"

import { api } from "@/lib/api"

// Calls that mirror a player's PlaySession changes to the API so they persist
// to MongoDB (per Clerk user). `sessionQueries` owns the cache; the mutation
// hooks in `session.queries.ts` apply optimistic writes and invalidate after
// the save settles, so this module stays a thin transport layer.

/** Persist (insert or replace) one of the signed-in user's sessions. */
export async function saveSession(session: PlaySession): Promise<void> {
  await api(`/api/sessions/${encodeURIComponent(session.id)}`, {
    method: "PUT",
    body: session,
  })
}

/**
 * Fetch the signed-in player's current sessions from the server — each
 * session's booking-derived fields (`bookingStatus`, `hold`, etc.) reflect
 * the latest venue decision. Used by `sessionQueries.mine()` for polling and
 * realtime invalidation.
 */
export async function listPlayerSessions(
  signal?: AbortSignal
): Promise<PlaySession[]> {
  return api<PlaySession[]>("/api/sessions", { signal })
}
