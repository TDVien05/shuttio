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
 * Flip one notification's read flag immediately and mirror it to the server.
 * A failed write restores the previous list, so the bell never claims a
 * notification was read when the API rejected it.
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications() })
      const previous = queryClient.getQueryData<NotificationRecord[]>(
        queryKeys.notifications()
      )
      queryClient.setQueryData<NotificationRecord[]>(
        queryKeys.notifications(),
        (records) =>
          records?.map((record) =>
            record.id === id ? { ...record, read: true } : record
          )
      )
      return { previous }
    },

    onError: (_error, _id, context) => {
      if (context?.previous) {
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
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications() })
      const previous = queryClient.getQueryData<NotificationRecord[]>(
        queryKeys.notifications()
      )
      queryClient.setQueryData<NotificationRecord[]>(
        queryKeys.notifications(),
        (records) => records?.map((record) => ({ ...record, read: true }))
      )
      return { previous }
    },

    onError: (_error, _vars, context) => {
      if (context?.previous) {
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
