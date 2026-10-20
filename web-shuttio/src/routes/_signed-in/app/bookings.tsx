import { createFileRoute } from "@tanstack/react-router"

import { BookingsView } from "@/features/booking/bookings"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_signed-in/app/bookings")({
  head: () => pageTitle(m.bookings_meta_title(), m.bookings_meta_description()),
  component: BookingsView,
})
