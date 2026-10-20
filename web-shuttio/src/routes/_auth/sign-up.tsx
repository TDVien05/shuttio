import { createFileRoute } from "@tanstack/react-router"

import { SignUpForm } from "@/features/auth/components/sign-up-form"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_auth/sign-up")({
  head: () => pageTitle(m.auth_sign_up_title()),
  component: SignUpForm,
})
