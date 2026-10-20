import { createFileRoute } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"

import { adminQueries } from "@/features/admin/api/admin.queries"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"
import { AdminAppReviewsView } from "@/features/admin/components/app-reviews"

export const Route = createFileRoute("/_authenticated/app/admin/reviews")({
  head: () =>
    pageTitle(
      m.admin_app_reviews_meta_title(),
      m.admin_app_reviews_meta_description()
    ),
  component: AdminReviewsPage,
})

function AdminReviewsPage() {
  const { data: reviews } = useSuspenseQuery(adminQueries.adminAppReviews())
  return <AdminAppReviewsView reviews={reviews} />
}
