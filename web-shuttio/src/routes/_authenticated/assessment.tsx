import { createFileRoute } from "@tanstack/react-router"
import { useSuspenseQueries } from "@tanstack/react-query"

import { EloAssessmentView } from "@/features/elo/components/elo-assessment"
import { pageTitle } from "@/lib/head"
import { onboardingQueries } from "@/features/onboarding/api/onboarding.queries"
import { venueQueries } from "@/features/venue/api/venue.queries"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authenticated/assessment")({
  head: () =>
    pageTitle(m.assessment_meta_title(), m.assessment_meta_description()),
  component: AssessmentPage,
})

function AssessmentPage() {
  const [{ data: accountType }, { data: venue }] = useSuspenseQueries({
    queries: [onboardingQueries.accountType(), venueQueries.myVenue()],
  })

  // "Both" accounts still need the venue wizard when they haven't provisioned
  // one yet — the assessment always comes first in that ordering.
  const nextPath = accountType !== "player" && !venue ? "/setup" : "/app"
  return <EloAssessmentView accountType={accountType} nextPath={nextPath} />
}
