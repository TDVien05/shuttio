import type {
  QueryClient,
  QueryKey,
  FetchQueryOptions,
} from "@tanstack/react-query"

import { ApiError } from "@/lib/api-error"

/**
 * `fetchQuery` for a route's `beforeLoad` redirect decision. A signed-out
 * visitor gets a 401 here before the `_authenticated` layout can send them to
 * sign-in, so that case yields `undefined` and the layout handles it; any other
 * failure still surfaces.
 */
export async function fetchForGuard<T, TKey extends QueryKey>(
  queryClient: QueryClient,
  options: FetchQueryOptions<T, Error, T, TKey>
): Promise<T | undefined> {
  try {
    return await queryClient.fetchQuery(options)
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return undefined
    throw error
  }
}
