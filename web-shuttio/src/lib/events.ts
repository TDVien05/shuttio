import { fetchEventSource } from "@microsoft/fetch-event-source"

import { apiUrl, authHeaders } from "@/lib/api"

/**
 * Subscribe to one named event of an api server-sent-events stream (e.g.
 * `GET /api/rooms/events` → `room`). `EventSource` can't send the Clerk
 * bearer token, so this uses `fetchEventSource`, which also retries a dropped
 * stream. Returns the unsubscribe function.
 */
export function openEventStream(
  path: string,
  event: string,
  onEvent: (data: string) => void
): () => void {
  const controller = new AbortController()
  void fetchEventSource(apiUrl(path), {
    signal: controller.signal,
    // Re-read the token on every (re)connect so a retry never reuses an
    // expired one.
    fetch: async (input, init) =>
      fetch(input, {
        ...init,
        headers: { ...init?.headers, ...(await authHeaders()) },
      }),
    // Keep streaming while the tab is hidden; callers already refetch on focus.
    openWhenHidden: true,
    onmessage: (message) => {
      if (message.event === event) onEvent(message.data)
    },
  }).catch(() => {
    // Aborted on unsubscribe.
  })
  return () => controller.abort()
}
