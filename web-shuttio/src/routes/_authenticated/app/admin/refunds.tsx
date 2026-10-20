import { createFileRoute } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"

import { adminQueries } from "@/features/admin/api/admin.queries"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"
import { AdminRefundsView } from "@/features/admin/components/refunds"

export const Route = createFileRoute("/_authenticated/app/admin/refunds")({
  head: () =>
    pageTitle(m.admin_refunds_meta_title(), m.admin_refunds_meta_description()),
  component: AdminRefundsPage,
})

function AdminRefundsPage() {
  const { data: refunds } = useSuspenseQuery(adminQueries.adminRefunds())
  return <AdminRefundsView refunds={refunds} />
}
