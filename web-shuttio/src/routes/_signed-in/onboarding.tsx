import { Navigate, createFileRoute } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"

import { OnboardingView } from "@/features/onboarding/onboarding-view"
import { pageTitle } from "@/lib/head"
import { queries } from "@/lib/queries"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_signed-in/onboarding")({
  head: () =>
    pageTitle(m.onboarding_meta_title(), m.onboarding_meta_description()),
  component: OnboardingPage,
})

function OnboardingPage() {
  const { data: accountType } = useSuspenseQuery(queries.accountType())

  // Already chosen (or inferred)? The choice is one-shot — send them straight
  // into their workspace instead of re-asking.
  if (accountType) {
    return (
      <Navigate to={accountType === "venue" ? "/app/venue" : "/app"} replace />
    )
  }
  return <OnboardingView />
}
