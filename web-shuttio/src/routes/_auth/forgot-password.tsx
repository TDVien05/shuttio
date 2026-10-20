import { createFileRoute } from "@tanstack/react-router"

import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_auth/forgot-password")({
  head: () => pageTitle(m.auth_forgot_title()),
  component: ForgotPasswordForm,
})
