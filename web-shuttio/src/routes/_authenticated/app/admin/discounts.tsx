import { createFileRoute } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"

import { adminQueries } from "@/features/admin/api/admin.queries"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"
import { AdminDiscountsView } from "@/features/admin/components/discounts"

export const Route = createFileRoute("/_authenticated/app/admin/discounts")({
  head: () =>
    pageTitle(
      m.admin_discounts_meta_title(),
      m.admin_discounts_meta_description()
    ),
  component: AdminDiscountsPage,
})

function AdminDiscountsPage() {
  const { data: discounts } = useSuspenseQuery(adminQueries.adminDiscounts())
  return <AdminDiscountsView discounts={discounts} />
}
