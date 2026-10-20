import { Navigate, createFileRoute } from "@tanstack/react-router"
import { useSuspenseQueries } from "@tanstack/react-query"
import { z } from "zod"

import { Logo } from "@/components/logo"
import { Toaster } from "@/components/ui/sonner"
import { SetupWizard } from "@/features/venue/setup-wizard"
import { pageTitle } from "@/lib/head"
import { queries } from "@/lib/queries"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_signed-in/setup")({
  // `?branch=1` (from the branch switcher) adds another branch to the brand.
  validateSearch: z.object({ branch: z.string().optional() }),
  head: () =>
    pageTitle(m.venue_setup_meta_title(), m.venue_setup_meta_description()),
  component: SetupPage,
})

function SetupPage() {
  const { branch } = Route.useSearch()
  const [{ data: venue }, { data: accountType }] = useSuspenseQueries({
    queries: [queries.myVenue(), queries.accountType()],
  })

  // First-time setup is one-shot — an already-provisioned account goes to its
  // workspace unless it's adding a branch.
  if (!branch && venue) return <Navigate to="/app/venue" replace />

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
