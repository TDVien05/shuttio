import { createFileRoute } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"

import { adminQueries } from "@/features/admin/api/admin.queries"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"
import { AdminComplaintsView } from "@/features/admin/components/complaints"

export const Route = createFileRoute("/_authenticated/app/admin/complaints")({
  head: () =>
    pageTitle(
      m.admin_complaints_meta_title(),
      m.admin_complaints_meta_description()
    ),
  component: AdminComplaintsPage,
})

function AdminComplaintsPage() {
  const { data: complaints } = useSuspenseQuery(adminQueries.adminComplaints())
  return <AdminComplaintsView complaints={complaints} />
}
