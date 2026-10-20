import { createFileRoute } from "@tanstack/react-router"

import { SignInForm } from "@/features/auth/components/sign-in-form"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_auth/sign-in")({
  head: () => pageTitle(m.auth_sign_in_title()),
  component: SignInForm,
})
