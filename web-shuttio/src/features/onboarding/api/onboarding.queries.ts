import { queryOptions } from "@tanstack/react-query"

import { api } from "@/lib/api"
import type { AccountType } from "@/lib/shared"

/** Reads owned by the one-shot account-type onboarding flow. */
export const onboardingQueries = {
  /** The signed-in account's effective account type (null until chosen). */
  accountType: () =>
    queryOptions({
      queryKey: ["account"],
      queryFn: async ({ signal }) =>
        (
          await api<{ accountType: AccountType | null }>("/api/account", {
            signal,
          })
        ).accountType,
    }),
}
