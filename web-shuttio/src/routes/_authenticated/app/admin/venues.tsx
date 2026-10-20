import { createFileRoute } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"

import { adminQueries } from "@/features/admin/api/admin.queries"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"
import { AdminVenuesView } from "@/features/admin/components/venues"

export const Route = createFileRoute("/_authenticated/app/admin/venues")({
  head: () =>
    pageTitle(m.admin_venues_meta_title(), m.admin_venues_meta_description()),
  component: AdminVenuesPage,
})

function AdminVenuesPage() {
  const { data: groups } = useSuspenseQuery(adminQueries.adminVenues())
  return <AdminVenuesView groups={groups} />
}
