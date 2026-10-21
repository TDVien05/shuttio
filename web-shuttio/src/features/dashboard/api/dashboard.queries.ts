import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"

import { api } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"
import type { NotificationRecord, Seed } from "@/lib/shared"
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/features/dashboard/api/notification-api"

/** Reads owned by the player dashboard shell. */
export const dashboardQueries = {
  /**
   * The signed-in player's aggregate dashboard payload (`GET /api/seed`) —
   * every `/app` screen reads it through `useData()`.
   */
  seed: () =>
    queryOptions({
      queryKey: queryKeys.seed(),
      queryFn: ({ signal }) => api<Seed>("/api/seed", { signal }),
    }),
}

/** Reads owned by the notification centre. */
export const notificationQueries = {
  /** The signed-in user's server notifications, newest first. */
  list: () =>
    queryOptions({
      queryKey: queryKeys.notifications(),
      queryFn: listNotifications,
      refetchInterval: 10_000,
      refetchOnWindowFocus: true,
    }),
}

/**
 * Flip one notification's read flag while leaving the rest of the list (and
 * every other record's identity) untouched. Pure so the optimistic view can be
 * unit-tested.
 */
export function applyNotificationRead(
  records: NotificationRecord[] | undefined,
  id: string
): NotificationRecord[] | undefined {
  return records?.map((record) =>
    record.id === id ? { ...record, read: true } : record
  )
}

/** Mark every notification read. Pure so the optimistic view can be tested. */
export function applyAllNotificationsRead(
  records: NotificationRecord[] | undefined
): NotificationRecord[] | undefined {
  return records?.map((record) => ({ ...record, read: true }))
}

/**
 * Flip one notification's read flag immediately and mirror it to the server.
 * A failed write restores the previous list, so the bell never claims a
 * notification was read when the API rejected it.
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),

    onMutate: async (id) => {
      // 1. Stop an in-flight list read from overwriting the optimistic view.
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications() })
      // 2. Snapshot the cache so a rejected write can restore it.
      const previous = queryClient.getQueryData<NotificationRecord[]>(
        queryKeys.notifications()
      )
      // 3. Write the optimistic read flag.
      queryClient.setQueryData<NotificationRecord[]>(
        queryKeys.notifications(),
        (records) => applyNotificationRead(records, id)
      )
      // 4. Hand the snapshot to onError.
      return { previous }
    },

    onError: (_error, _id, context) => {
      if (context) {
        queryClient.setQueryData(queryKeys.notifications(), context.previous)
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.notifications(),
      })
    },
  })
}

/** Mark every notification read, with the same optimistic rollback. */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => markAllNotificationsRead(),

    onMutate: async () => {
      // 1. Stop an in-flight list read from overwriting the optimistic view.
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications() })
      // 2. Snapshot the cache so a rejected write can restore it.
      const previous = queryClient.getQueryData<NotificationRecord[]>(
        queryKeys.notifications()
      )
      // 3. Write the optimistic all-read view.
      queryClient.setQueryData<NotificationRecord[]>(
        queryKeys.notifications(),
        (records) => applyAllNotificationsRead(records)
      )
      // 4. Hand the snapshot to onError.
      return { previous }
    },

    onError: (_error, _vars, context) => {
      if (context) {
        queryClient.setQueryData(queryKeys.notifications(), context.previous)
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.notifications(),
      })
    },
  })
}
