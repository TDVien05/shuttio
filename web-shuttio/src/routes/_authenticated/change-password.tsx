import { createFileRoute } from "@tanstack/react-router"

import { Logo } from "@/components/logo"
import { ChangePasswordForm } from "@/features/auth/components/change-password-form"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authenticated/change-password")({
  head: () => pageTitle(m.auth_change_password_title()),
  component: ChangePasswordPage,
})

function ChangePasswordPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex justify-center">
          <Logo />
        </div>
        <ChangePasswordForm />
      </div>
    </div>
  )
}
