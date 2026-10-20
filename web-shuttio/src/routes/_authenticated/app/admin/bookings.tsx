import { createFileRoute } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"

import { adminQueries } from "@/features/admin/api/admin.queries"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"
import { AdminBookingsView } from "@/features/admin/components/bookings"

export const Route = createFileRoute("/_authenticated/app/admin/bookings")({
  head: () =>
    pageTitle(
      m.admin_bookings_meta_title(),
      m.admin_bookings_meta_description()
    ),
  component: AdminBookingsPage,
})

function AdminBookingsPage() {
  const { data: bookings } = useSuspenseQuery(adminQueries.adminBookings())
  return <AdminBookingsView bookings={bookings} />
}
