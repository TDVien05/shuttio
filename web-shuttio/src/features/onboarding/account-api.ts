import type { AccountType } from "@/lib/shared"

import { api } from "@/lib/api"
import { queryClient } from "@/integrations/tanstack-query/root-provider"

/** Persist the signed-in account's self-declared type from the onboarding page. */
export async function chooseAccountType(
  accountType: AccountType
): Promise<void> {
  await api("/api/account", {
    method: "PUT",
    body: { accountType },
  })
  void queryClient.invalidateQueries()
}
