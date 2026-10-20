import { createFileRoute } from "@tanstack/react-router"

import { BookView } from "@/features/booking/book"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_signed-in/app/book")({
  head: () => pageTitle(m.booking_meta_title(), m.booking_meta_description()),
  component: BookView,
})
