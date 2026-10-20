import { Navigate, createFileRoute } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"

import { Toaster } from "@/components/ui/sonner"
import { PlayerAssessmentGate } from "@/features/assessment/components/player-assessment-gate"
import { useAuthUser } from "@/features/dashboard/hooks/use-auth-user"
import { DashboardFrame } from "@/components/layouts/dashboard-frame"
import { DataProvider } from "@/features/dashboard/components/data-provider"
import { NotificationsProvider } from "@/features/dashboard/components/notifications"
import { PlayerChrome } from "@/components/layouts/player-chrome"
import { SessionProvider } from "@/features/play/components/session"
import { dashboardQueries } from "@/features/dashboard/api/dashboard.queries"

export const Route = createFileRoute("/_authenticated/app")({
  component: DashboardLayout,
})

/**
 * The providers mounted here wrap every dashboard page, so their state and
 * timers survive client-side navigation between sections.
 */
function DashboardLayout() {
  const user = useAuthUser()
  const { data: seed } = useSuspenseQuery(dashboardQueries.seed())
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
