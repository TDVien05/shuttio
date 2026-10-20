import { createFileRoute } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"

import { adminQueries } from "@/features/admin/api/admin.queries"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"
import { AdminOverviewView } from "@/features/admin/components/overview"

export const Route = createFileRoute("/_authenticated/app/admin/")({
  head: () =>
    pageTitle(
      m.admin_overview_meta_title(),
      m.admin_overview_meta_description()
    ),
  component: AdminOverviewPage,
})

function AdminOverviewPage() {
  const { data: overview } = useSuspenseQuery(adminQueries.adminOverview())
  return <AdminOverviewView overview={overview} />
}
