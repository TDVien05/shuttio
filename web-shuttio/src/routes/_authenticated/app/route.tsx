import { Navigate, createFileRoute } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"

import { RouteLoading } from "@/components/layouts/route-loading"
import { Toaster } from "@/components/ui/sonner"
import { PlayerAssessmentGate } from "@/features/assessment/components/player-assessment-gate"
import { useAuthUser } from "@/features/dashboard/hooks/use-auth-user"
import { DashboardFrame } from "@/components/layouts/dashboard-frame"
import { DataProvider } from "@/features/dashboard/components/data-provider"
import { ChatRealtime } from "@/features/chat/components/chat-realtime"
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
  const { data: seed, isFetching } = useSuspenseQuery(dashboardQueries.seed())
  const isAdmin = user.role === "admin"

  // No account type chosen or inferred yet — send fresh accounts through the
  // onboarding choice point first. An admin never picks player/venue.
  // A cached payload can predate the choice (the onboarding page reads a fresher
  // query), so wait for the refetch before redirecting — otherwise the two
  // routes bounce between each other.
  if (seed.accountType === null && !isAdmin) {
    if (isFetching) return <RouteLoading />
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
            <ChatRealtime />
          </PlayerAssessmentGate>
        </NotificationsProvider>
        <Toaster />
      </SessionProvider>
    </DataProvider>
  )
}
