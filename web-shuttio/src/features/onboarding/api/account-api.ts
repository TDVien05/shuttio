import { useMutation, useQueryClient } from "@tanstack/react-query"

import type { AccountType } from "@/lib/shared"
import { api } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"

/** Persist the signed-in account's self-declared type from the onboarding page. */
export function useChooseAccountType() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (accountType: AccountType) =>
      api("/api/account", {
        method: "PUT",
        body: { accountType },
      }),

    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.account() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.seed() }),
      ])
    },
  })
}
