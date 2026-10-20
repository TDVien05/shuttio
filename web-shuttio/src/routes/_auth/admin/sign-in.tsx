import { createFileRoute } from "@tanstack/react-router"

import { AdminSignInForm } from "@/features/auth/components/admin-sign-in-form"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_auth/admin/sign-in")({
  head: () => pageTitle(m.auth_admin_sign_in_title()),
  component: AdminSignInForm,
})
