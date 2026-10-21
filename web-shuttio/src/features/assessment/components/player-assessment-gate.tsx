import { Navigate, useLocation } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import * as React from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { workspaceForPath } from "@/features/dashboard/lib/workspace"
import type { AccountType } from "@/lib/shared"
import { assessmentQueries } from "@/features/assessment/api/assessment.queries"
import { PLAYER_ASSESSMENT_PATH } from "@/features/assessment/lib/player-assessment"
import { m } from "@/paraglide/messages"

interface PlayerAssessmentGateProps {
  children: React.ReactNode
  /** Effective account type (from the dashboard seed); drives the venue-only lock. */
  accountType?: AccountType | null
  /**
   * Whether the signed-in caller carries the Clerk `"admin"` role. Exemption
   * is keyed on this, not on the current route's workspace — an admin has no
   * accountType and must never be routed into the assessment wizard even from
   * a player-workspace page (e.g. switching there from the sidebar).
   */
  isAdmin?: boolean
}

/**
 * Redirects players who haven't completed the skill assessment to the dedicated
 * wizard page ({@link PLAYER_ASSESSMENT_PATH}). The assessment query is the
 * single source of truth; there is no local-cache readiness state. The venue
 * workspace is never gated, and an admin account is never gated regardless of
 * which workspace it's currently viewing (an admin may have no accountType at
 * all). A venue-only account is locked out of the player workspace entirely
 * (redirected to their venue instead) and never asked to assess.
 */
export function PlayerAssessmentGate({
  children,
  accountType = null,
  isAdmin = false,
}: PlayerAssessmentGateProps) {
  const pathname = useLocation({ select: (l) => l.pathname })
  const workspace = workspaceForPath(pathname)
  const venueOnly = accountType === "venue"
  const exempt = workspace === "venue" || isAdmin
  // The assessment page sits outside /app but is still "player" by path, and
  // this gate stays mounted for a render while navigating to it — a venue-only
  // account heading there to become a player must not be bounced back.
  const lockedOut = venueOnly && !exempt && pathname.startsWith("/app")
  const needsAssessment = !exempt && !venueOnly

  const { data: assessment, isPending } = useQuery({
    ...assessmentQueries.assessment(),
    enabled: needsAssessment,
  })

  if (lockedOut) return <Navigate to="/app/venue" replace />
  if (!needsAssessment) return <>{children}</>
  if (isPending) return <AssessmentLoading />
  if (!assessment) return <Navigate to={PLAYER_ASSESSMENT_PATH} replace />

  return <>{children}</>
}

function AssessmentLoading() {
  return (
    <div className="grid min-h-dvh place-items-center bg-stage-glow-tl p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{m.assessment_loading_title()}</CardTitle>
          <CardDescription>
            {m.assessment_loading_description()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={55} aria-label={m.assessment_loading_title()} />
        </CardContent>
      </Card>
    </div>
  )
}
