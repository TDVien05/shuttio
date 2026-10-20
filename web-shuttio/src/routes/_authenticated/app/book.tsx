import { createFileRoute } from "@tanstack/react-router"

import { BookView } from "@/features/booking/components/book"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authenticated/app/book")({
  head: () => pageTitle(m.booking_meta_title(), m.booking_meta_description()),
  component: BookView,
})
