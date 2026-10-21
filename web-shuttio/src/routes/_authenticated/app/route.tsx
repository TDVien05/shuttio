import { Navigate, createFileRoute, useLocation } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"

import { RouteLoading } from "@/components/layouts/route-loading"
import { Toaster } from "@/components/ui/sonner"
import { PlayerAssessmentGate } from "@/features/assessment/components/player-assessment-gate"
import { useAuthUser } from "@/features/dashboard/hooks/use-auth-user"
import { DashboardFrame } from "@/components/layouts/dashboard-frame"
import { DataProvider } from "@/features/dashboard/components/data-provider"
import { LocationProvider } from "@/features/dashboard/state/location"
import { BookingDraftProvider } from "@/features/booking/state/booking-draft"
import { ChatRealtime } from "@/features/chat/components/chat-realtime"
import { NotificationsToaster } from "@/features/dashboard/components/notifications"
import { PlayerChrome } from "@/components/layouts/player-chrome"
import { SessionUiProvider } from "@/features/play/state/session-ui"
import { SessionExpiryWatcher } from "@/features/play/components/session-expiry-watcher"
import { SessionRealtime } from "@/features/play/components/session-realtime"
import { dashboardQueries } from "@/features/dashboard/api/dashboard.queries"
import { workspaceForPath } from "@/features/dashboard/lib/workspace"

export const Route = createFileRoute("/_authenticated/app")({
  component: DashboardLayout,
})

/**
 * The providers mounted here wrap every dashboard page, so their state and
 * timers survive client-side navigation between sections.
 */
function DashboardLayout() {
  const user = useAuthUser()
  const pathname = useLocation({ select: (location) => location.pathname })
  const { data: seed, isFetching } = useSuspenseQuery(dashboardQueries.seed())
  const isAdmin = user.role === "admin"
  const isPlayerWorkspace = workspaceForPath(pathname) === "player"

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
    <LocationProvider>
      <DataProvider>
        <BookingDraftProvider>
          <SessionUiProvider>
            {isPlayerWorkspace ? <SessionExpiryWatcher /> : null}
            <SessionRealtime playerWorkspace={isPlayerWorkspace} />
            <NotificationsToaster />
            <PlayerAssessmentGate
              accountType={seed.accountType}
              isAdmin={isAdmin}
            >
              <DashboardFrame />
              <PlayerChrome />
              <ChatRealtime />
            </PlayerAssessmentGate>
            <Toaster />
          </SessionUiProvider>
        </BookingDraftProvider>
      </DataProvider>
    </LocationProvider>
  )
}
