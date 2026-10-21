import { createFileRoute, redirect } from "@tanstack/react-router"

import { OnboardingView } from "@/features/onboarding/components/onboarding-view"
import { fetchForGuard } from "@/lib/route-guard"
import { pageTitle } from "@/lib/head"
import { onboardingQueries } from "@/features/onboarding/api/onboarding.queries"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authenticated/onboarding")({
  // The choice is one-shot — an account that already has (or has inferred) a
  // type goes straight into its workspace instead of being re-asked.
  beforeLoad: async ({ context }) => {
    const accountType = await fetchForGuard(
      context.queryClient,
      onboardingQueries.accountType()
    )
    if (accountType) {
      throw redirect({
        to: accountType === "venue" ? "/app/venue" : "/app",
        replace: true,
      })
    }
  },
  head: () =>
    pageTitle(m.onboarding_meta_title(), m.onboarding_meta_description()),
  component: OnboardingPage,
})

function OnboardingPage() {
  return <OnboardingView />
}
