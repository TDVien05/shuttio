import type { AccountType } from "@/lib/shared"

import { api } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"
import { queryClient } from "@/lib/query-client"

/** Persist the signed-in account's self-declared type from the onboarding page. */
export async function chooseAccountType(
  accountType: AccountType
): Promise<void> {
  await api("/api/account", {
    method: "PUT",
    body: { accountType },
  })
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.account() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.seed() }),
  ])
}
