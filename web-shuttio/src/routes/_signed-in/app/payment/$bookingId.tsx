import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { PaymentScreen } from "@/features/booking/payment-screen"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_signed-in/app/payment/$bookingId")({
  validateSearch: z.object({ discount: z.string().optional() }),
  head: () =>
    pageTitle(
      m.payment_viet_qr_meta_title(),
      m.payment_viet_qr_meta_description()
    ),
  component: PaymentPage,
})

function PaymentPage() {
  const { bookingId } = Route.useParams()
  const { discount } = Route.useSearch()
  return (
    <PaymentScreen
      bookingId={bookingId}
      discountCode={discount?.trim() || undefined}
    />
  )
}
