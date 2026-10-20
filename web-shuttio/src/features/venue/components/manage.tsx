import { useRouter } from "@tanstack/react-router"
import * as React from "react"
import { toast } from "sonner"
import { AlertTriangle, ArchiveRestore } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button, LinkButton } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { courtStateAccent } from "@/lib/shared"
import type { BranchSummary, CourtState } from "@/lib/shared"
import { VenuePanel } from "@/features/venue/components/shared"
import { PayoutEditor } from "@/features/venue/components/payout-fields"
import type { PayoutDraft } from "@/lib/bank-account"
import { useVenueData } from "@/features/venue/components/venue-data-provider"
import { venueBase } from "@/features/venue/nav"
import { archiveVenue, restoreVenue } from "@/features/venue/api/venue-api"
import { m } from "@/paraglide/messages"

const overviewApprovalMessages = {
  pending: m.venue_manage_overview_approval_pending,
  approved: m.venue_manage_overview_approval_approved,
  rejected: m.venue_manage_overview_approval_rejected,
} as const

const APPROVAL_VARIANT = {
  pending: "outline",
  approved: "secondary",
  rejected: "destructive",
} as const

const COURT_STATES: CourtState[] = [
  "available",
  "in-play",
  "upcoming",
  "maintenance",
]

/**
 * The venue "manage" screen — reached from the workspace switcher (sidebar
 * header dropdown), not the persistent nav (kept at 4 tabs, see
 * `nav-simplification`). Scoped to this branch (chi nhánh): archive/restore
 * (VienTD-Review decision #11). An archived branch stays under the brand and
 * keeps appearing in the switcher, so restoring here — instead of running
 * setup again — is the way back. It's also the HUB for the whole brand: the
 * cross-branch overview table (plan 021) is the only place an operator sees
 * every branch's court count/status at once, since every other screen is
 * scoped to one branch via the `[venueId]` URL segment.
 */
export function VenueManageView({
  branches,
  payout,
}: {
  branches: BranchSummary[]
  payout: PayoutDraft | null
}) {
  const router = useRouter()
  const { venueId, venue: VENUE } = useVenueData()
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [isPending, startTransition] = React.useTransition()

  const stateLabel: Record<CourtState, string> = {
    available: m.venue_manage_overview_states_available(),
    "in-play": m.venue_manage_overview_states_in_play(),
    upcoming: m.venue_manage_overview_states_upcoming(),
    maintenance: m.venue_manage_overview_states_maintenance(),
  }

  const goToReservations = React.useCallback(() => {
    void router.navigate({
      href: `${venueBase(venueId)}/schedule?tab=reservations`,
    })
  }, [router, venueId])

  const handleArchive = () => {
    setConfirmOpen(false)
    startTransition(async () => {
      try {
        await archiveVenue(venueId)
        toast.success(m.venue_manage_archive_venue_done({ name: VENUE.name }))
      } catch (error) {
        const message =
          error instanceof Error ? error.message : m.venue_manage_error()
        // A 409 means a pending/confirmed booking still sits in the future —
        // point the operator at the reservations screen to clear it first
        // instead of just failing silently.
        toast.error(message, {
          action: {
            label: m.venue_manage_archive_venue_view_reservations(),
            onClick: goToReservations,
          },
        })
      }
    })
  }

  const handleRestore = () => {
    startTransition(async () => {
      try {
        await restoreVenue(venueId)
        toast.success(m.venue_manage_restore_venue_done({ name: VENUE.name }))
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : m.venue_manage_error()
        )
      }
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {m.venue_manage_manage_title()}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {m.venue_manage_manage_subtitle()}
        </p>
      </div>

      <VenuePanel title={m.venue_manage_payout_title()}>
        <PayoutEditor initial={payout} />
      </VenuePanel>

      <VenuePanel title={m.venue_manage_overview_title()}>
        <p className="mb-3 text-sm text-muted-foreground">
          {m.venue_manage_overview_subtitle()}
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.venue_manage_overview_col_branch()}</TableHead>
              <TableHead>{m.venue_manage_overview_col_area()}</TableHead>
              <TableHead align="right">
                {m.venue_manage_overview_col_courts()}
              </TableHead>
              <TableHead>{m.venue_manage_overview_col_states()}</TableHead>
              <TableHead>{m.venue_manage_overview_col_approval()}</TableHead>
              <TableHead align="right">
                {m.venue_manage_overview_col_actions()}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {branches.map((b) => (
              <TableRow
                key={b.venueId}
                className={cn(b.venueId === venueId && "bg-brand/5")}
              >
                <TableCell weight="medium">
                  <div className="flex items-center gap-2">
                    {b.name}
                    {b.venueId === venueId ? (
                      <Badge variant="secondary">
                        {m.venue_manage_overview_current()}
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell size="sm" tone="muted">
                  {b.ward} · {b.province}
                </TableCell>
                <TableCell align="right" numeric="yes">
                  {b.courtCount}
                </TableCell>
                <TableCell>
                  {b.courtCount === 0 ? (
                    <Badge variant="outline" className="text-muted-foreground">
                      {m.venue_manage_overview_empty()}
                    </Badge>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {COURT_STATES.filter(
                        (state) => b.stateCounts[state] > 0
                      ).map((state) => (
                        <span
                          key={state}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-mini font-medium",
                            courtStateAccent[state]
                          )}
                        >
                          {b.stateCounts[state]} {stateLabel[state]}
                        </span>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={APPROVAL_VARIANT[b.approval ?? "approved"]}>
                    {overviewApprovalMessages[b.approval ?? "approved"]()}
                  </Badge>
                </TableCell>
                <TableCell align="right">
                  <LinkButton
                    shape="pill"
                    size="sm"
                    variant="outline"

                    href={`${venueBase(b.venueId)}/courts`}
                  >
                    {m.venue_manage_overview_manage()}
                  </LinkButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </VenuePanel>

      {VENUE.archived ? (
        <div className="flex flex-col gap-4 rounded-4xl bg-card p-5 shadow-md ring-1 ring-amber-500/30 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
            <div>
              <p className="font-heading text-sm font-semibold">
                {m.venue_manage_archived_banner_title()}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {m.venue_manage_archived_banner_description()}
              </p>
            </div>
          </div>
          <Button
            shape="pill"
            onPress={handleRestore}
            isDisabled={isPending}
            className="shrink-0"
          >
            <ArchiveRestore />
            {isPending
              ? m.venue_manage_restore_venue_pending()
              : m.venue_manage_restore_venue_button()}
          </Button>
        </div>
      ) : (
        <VenuePanel
          title={m.venue_manage_danger_zone_title()}
          icon={AlertTriangle}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">
                {m.venue_manage_danger_zone_archive_label()}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {m.venue_manage_danger_zone_archive_description()}
              </p>
            </div>
            <Button
              shape="pill"
              variant="destructive"
              className="shrink-0"
              isDisabled={isPending}
              onPress={() => setConfirmOpen(true)}
            >
              {m.venue_manage_archive()}
            </Button>
          </div>
        </VenuePanel>
      )}

      <Dialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>{m.venue_manage_archive_venue_title()}</DialogTitle>
          <DialogDescription>
            {m.venue_manage_archive_venue_description({ name: VENUE.name })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onPress={() => setConfirmOpen(false)}>
            {m.venue_manage_cancel()}
          </Button>
          <Button
            variant="destructive"
            isDisabled={isPending}
            onPress={handleArchive}
          >
            {isPending
              ? m.venue_manage_archive_venue_pending()
              : m.venue_manage_archive_venue_confirm()}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}
