import { Navigate, createFileRoute } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"

import { Toaster } from "@/components/ui/sonner"
import { PlayerAssessmentGate } from "@/features/assessment/player-assessment-gate"
import { useAuthUser } from "@/features/dashboard/auth-user"
import { DashboardFrame } from "@/features/dashboard/dashboard-frame"
import { DataProvider } from "@/features/dashboard/data-provider"
import { NotificationsProvider } from "@/features/dashboard/notifications"
import { PlayerChrome } from "@/features/dashboard/player-chrome"
import { SessionProvider } from "@/features/play/session"
import { queries } from "@/lib/queries"

export const Route = createFileRoute("/_signed-in/app")({
  component: DashboardLayout,
})

/**
 * The providers mounted here wrap every dashboard page, so their state and
 * timers survive client-side navigation between sections.
 */
function DashboardLayout() {
  const user = useAuthUser()
  const { data: seed } = useSuspenseQuery(queries.seed())
  const isAdmin = user.role === "admin"

  // No account type chosen or inferred yet — send fresh accounts through the
  // onboarding choice point first. An admin never picks player/venue.
  if (seed.accountType === null && !isAdmin) {
    return <Navigate to="/onboarding" replace />
  }

  return (
    <DataProvider seed={seed}>
      <SessionProvider>
        <NotificationsProvider>
          <PlayerAssessmentGate
            serverAssessment={seed.assessment}
            accountType={seed.accountType}
            isAdmin={isAdmin}
          >
            <DashboardFrame />
            <PlayerChrome />
          </PlayerAssessmentGate>
        </NotificationsProvider>
        <Toaster />
      </SessionProvider>
    </DataProvider>
  )
}
