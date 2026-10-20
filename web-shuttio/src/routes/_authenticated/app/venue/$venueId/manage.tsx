import { createFileRoute } from "@tanstack/react-router"
import { useSuspenseQueries } from "@tanstack/react-query"

import { VenueManageView } from "@/features/venue/components/manage"
import { pageTitle } from "@/lib/head"
import { venueQueries } from "@/features/venue/api/venue.queries"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authenticated/app/venue/$venueId/manage"
)({
  head: () =>
    pageTitle(m.venue_manage_meta_title(), m.venue_manage_meta_description()),
  component: ManagePage,
})

function ManagePage() {
  const [{ data: branches }, { data: payout }] = useSuspenseQueries({
    queries: [venueQueries.branchesSummary(), venueQueries.payout()],
  })
  return (
    <VenueManageView
      branches={branches}
      payout={
        payout
          ? {
              bankBin: payout.bankBin,
              accountNo: payout.accountNo,
              accountName: payout.accountName,
            }
          : null
      }
    />
  )
}
