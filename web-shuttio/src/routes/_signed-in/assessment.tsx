import { createFileRoute } from "@tanstack/react-router"
import { useSuspenseQueries } from "@tanstack/react-query"

import { SkillsAssessmentView } from "@/features/assessment/skills-assessment"
import { pageTitle } from "@/lib/head"
import { queries } from "@/lib/queries"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_signed-in/assessment")({
  head: () =>
    pageTitle(m.assessment_meta_title(), m.assessment_meta_description()),
  component: AssessmentPage,
})

function AssessmentPage() {
  const [{ data: initial }, { data: accountType }, { data: venue }] =
    useSuspenseQueries({
      queries: [queries.assessment(), queries.accountType(), queries.myVenue()],
    })

  // "Both" accounts still need the venue wizard when they haven't provisioned
  // one yet — the assessment always comes first in that ordering.
  const nextPath = accountType !== "player" && !venue ? "/setup" : "/app"
  return <SkillsAssessmentView initial={initial} nextPath={nextPath} />
}
