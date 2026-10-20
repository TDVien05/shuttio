import { createFileRoute } from "@tanstack/react-router"
import { useSuspenseQueries } from "@tanstack/react-query"

import { SkillsAssessmentView } from "@/features/assessment/components/skills-assessment"
import { pageTitle } from "@/lib/head"
import { assessmentQueries } from "@/features/assessment/api/assessment.queries"
import { onboardingQueries } from "@/features/onboarding/api/onboarding.queries"
import { venueQueries } from "@/features/venue/api/venue.queries"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authenticated/assessment")({
  head: () =>
    pageTitle(m.assessment_meta_title(), m.assessment_meta_description()),
  component: AssessmentPage,
})

function AssessmentPage() {
  const [{ data: initial }, { data: accountType }, { data: venue }] =
    useSuspenseQueries({
      queries: [
        assessmentQueries.assessment(),
        onboardingQueries.accountType(),
        venueQueries.myVenue(),
      ],
    })

  // "Both" accounts still need the venue wizard when they haven't provisioned
  // one yet — the assessment always comes first in that ordering.
  const nextPath = accountType !== "player" && !venue ? "/setup" : "/app"
  return <SkillsAssessmentView initial={initial} nextPath={nextPath} />
}
