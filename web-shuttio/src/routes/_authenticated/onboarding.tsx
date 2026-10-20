import { Navigate, createFileRoute } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"

import { OnboardingView } from "@/features/onboarding/components/onboarding-view"
import { pageTitle } from "@/lib/head"
import { onboardingQueries } from "@/features/onboarding/api/onboarding.queries"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () =>
    pageTitle(m.onboarding_meta_title(), m.onboarding_meta_description()),
  component: OnboardingPage,
})

function OnboardingPage() {
  const { data: accountType } = useSuspenseQuery(
    onboardingQueries.accountType()
  )

  // Already chosen (or inferred)? The choice is one-shot — send them straight
  // into their workspace instead of re-asking.
  if (accountType) {
    return (
      <Navigate to={accountType === "venue" ? "/app/venue" : "/app"} replace />
    )
  }
  return <OnboardingView />
}
