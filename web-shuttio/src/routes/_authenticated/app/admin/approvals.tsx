import { createFileRoute } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"

import { adminQueries } from "@/features/admin/api/admin.queries"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"
import { AdminApprovalsView } from "@/features/admin/components/approvals"

export const Route = createFileRoute("/_authenticated/app/admin/approvals")({
  head: () =>
    pageTitle(
      m.admin_approvals_meta_title(),
      m.admin_approvals_meta_description()
    ),
  component: AdminApprovalsPage,
})

function AdminApprovalsPage() {
  const { data: brands } = useSuspenseQuery(adminQueries.adminApprovals())
  return <AdminApprovalsView brands={brands} />
}
