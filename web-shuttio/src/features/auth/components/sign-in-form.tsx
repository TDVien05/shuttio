import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useSignIn } from "@clerk/react/legacy"

import { FormError, useAppForm } from "@/components/form"
import { m } from "@/paraglide/messages"

import { AuthDivider, GoogleButton } from "./google-button"
import { clerkErrorMessage } from "../lib/clerk-error"
import { signInSchema } from "../schemas/auth.schema"

export function SignInForm() {
  const navigate = useNavigate()
  const { signIn, setActive, isLoaded } = useSignIn()
  const [error, setError] = React.useState<string | null>(null)

  const form = useAppForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: signInSchema },
    onSubmit: async ({ value }) => {
      if (!isLoaded) return
      setError(null)
      try {
        const res = await signIn.create({
          identifier: value.email,
          password: value.password,
        })
        if (res.status === "complete") {
          await setActive({ session: res.createdSessionId })
          await navigate({ to: "/app" })
          return
        }
        setError(m.auth_sign_in_error())
      } catch (err) {
        setError(clerkErrorMessage(err, m.auth_sign_in_error()))
      }
    },
  })

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          {m.auth_sign_in_title()}
        </h1>
        <p className="text-sm text-muted-foreground">
          {m.auth_sign_in_subtitle()}
        </p>
      </div>

      <GoogleButton />
      <AuthDivider />

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
              labelAction={
                <Link
                  to="/forgot-password"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {m.auth_sign_in_forgot()}
                </Link>
              }
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
        {m.auth_sign_in_no_account()}{" "}
        <Link
          to="/sign-up"
          className="font-medium text-primary hover:underline"
        >
          {m.auth_sign_in_sign_up_link()}
        </Link>
      </p>
    </div>
  )
}
