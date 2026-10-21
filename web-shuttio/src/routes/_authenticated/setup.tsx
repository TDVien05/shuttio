import { createFileRoute, redirect } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"
import { z } from "zod"

import { Logo } from "@/components/logo"
import { Toaster } from "@/components/ui/sonner"
import { SetupWizard } from "@/features/venue/components/setup-wizard"
import { pageTitle } from "@/lib/head"
import { fetchForGuard } from "@/lib/route-guard"
import { venueQueries } from "@/features/venue/api/venue.queries"
import { onboardingQueries } from "@/features/onboarding/api/onboarding.queries"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authenticated/setup")({
  // `?branch=1` (from the branch switcher) adds another branch to the brand.
  validateSearch: z.object({ branch: z.string().optional() }),
  // First-time setup is one-shot — an already-provisioned account goes to its
  // workspace unless it's adding a branch.
  beforeLoad: async ({ search, context }) => {
    if (search.branch) return
    const venue = await fetchForGuard(
      context.queryClient,
      venueQueries.myVenue()
    )
    if (venue) throw redirect({ to: "/app/venue", replace: true })
  },
  head: () =>
    pageTitle(m.venue_setup_meta_title(), m.venue_setup_meta_description()),
  component: SetupPage,
})

function SetupPage() {
  const { branch } = Route.useSearch()
  const { data: accountType } = useSuspenseQuery(
    onboardingQueries.accountType()
  )

  // Where "Back" on the first step leaves to. Adding a branch returns to the
  // venue workspace; a first-time setup returns to the player workspace —
  // unless the account is venue-only (its workspace would bounce back here).
  const exitHref = branch
    ? "/app/venue"
    : accountType === "venue"
      ? "/"
      : "/app"

  return (
    <div className="flex min-h-svh flex-col items-center bg-background px-4 py-10 sm:py-16">
      <div className="mb-8 flex justify-center">
        <Logo />
      </div>
      <SetupWizard addingBranch={Boolean(branch)} exitHref={exitHref} />
      <Toaster />
    </div>
  )
}
