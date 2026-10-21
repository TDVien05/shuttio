import type { NotificationRecord } from "@/lib/shared"

import { api } from "@/lib/api"

// Client calls for the transactional notification feed
// (`api/src/features/notifications/`). `notificationQueries` polls through
// these and the read mutations mirror optimistic state back to the server.

/**
 * The signed-in user's notifications, newest first. Every real record carries
 * a `createdAt`; an older api build answers this route from a legacy endpoint
 * that returns the profile's demo items (no `createdAt`), so those are dropped.
 */
export async function listNotifications(): Promise<NotificationRecord[]> {
  const records = await api<NotificationRecord[]>("/api/notifications")
  return Array.isArray(records)
    ? records.filter((r) => !Number.isNaN(Date.parse(r.createdAt)))
    : []
}

/** Mark one notification read (idempotent — a no-op if already read). */
export async function markNotificationRead(id: string): Promise<void> {
  await api(`/api/notifications/${encodeURIComponent(id)}/read`, {
    method: "PUT",
  })
}

/** Mark every one of the signed-in user's notifications read. */
export async function markAllNotificationsRead(): Promise<void> {
  await api("/api/notifications/read-all", { method: "PUT" })
}
