import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useClerk } from "@clerk/react"
import { useSignIn } from "@clerk/react/legacy"
import { ShieldCheck } from "lucide-react"

import { FormError, useAppForm } from "@/components/form"
import { m } from "@/paraglide/messages"

import { clerkErrorMessage } from "../lib/clerk-error"
import { adminSignInSchema } from "../schemas/auth.schema"

/**
 * Password-only sign-in for the admin workspace. The role lives in Clerk
 * `publicMetadata.role` (granted in the Clerk dashboard), so once the session
 * is active we check it and immediately sign a non-admin back out instead of
 * dropping them into the player dashboard. The api's `/api/admin/*` routes are
 * the security boundary — this is only the UX gate.
 */
export function AdminSignInForm() {
  const navigate = useNavigate()
  const clerk = useClerk()
  const { signIn, setActive, isLoaded } = useSignIn()
  const [error, setError] = React.useState<string | null>(null)

  const form = useAppForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: adminSignInSchema },
    onSubmit: async ({ value }) => {
      if (!isLoaded) return
      setError(null)
      try {
        const res = await signIn.create({
          identifier: value.email,
          password: value.password,
        })
        if (res.status !== "complete") {
          setError(m.auth_sign_in_error())
          return
        }
        await setActive({ session: res.createdSessionId })
        if (clerk.user?.publicMetadata.role !== "admin") {
          await clerk.signOut()
          setError(m.auth_admin_sign_in_not_admin())
          return
        }
        await navigate({ to: "/app/admin" })
      } catch (err) {
        setError(clerkErrorMessage(err, m.auth_sign_in_error()))
      }
    },
  })

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="size-5" />
        </div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          {m.auth_admin_sign_in_title()}
        </h1>
        <p className="text-sm text-muted-foreground">
          {m.auth_admin_sign_in_subtitle()}
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
        className="space-y-4"
        noValidate
      >
        <form.AppField name="email">
          {(field) => (
            <field.TextField
              label={m.auth_email_label()}
              type="email"
              autoComplete="email"
              placeholder={m.auth_email_placeholder()}
            />
          )}
        </form.AppField>
        <form.AppField name="password">
          {(field) => (
            <field.TextField
              label={m.auth_password_label()}
              type="password"
              autoComplete="current-password"
              placeholder={m.auth_password_placeholder()}
            />
          )}
        </form.AppField>

        <FormError>{error}</FormError>

        <form.AppForm>
          <form.SubmitButton pendingLabel={m.auth_sign_in_submitting()}>
            {m.auth_sign_in_submit()}
          </form.SubmitButton>
        </form.AppForm>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        <Link to="/sign-in" className="hover:text-foreground hover:underline">
          {m.auth_admin_sign_in_back_to_sign_in()}
        </Link>
      </p>
    </div>
  )
}
