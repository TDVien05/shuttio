import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useSignIn } from "@clerk/react/legacy"

import { FormError, useAppForm } from "@/components/form"
import { m } from "@/paraglide/messages"

import { AuthDivider, GoogleButton } from "./google-button"
import { clerkErrorMessage } from "../lib/clerk-error"
import { signInSchema, verifyEmailSchema } from "../schemas/auth.schema"

export function SignInForm() {
  const navigate = useNavigate()
  const { signIn, setActive, isLoaded } = useSignIn()
  const [error, setError] = React.useState<string | null>(null)
  const [needsCode, setNeedsCode] = React.useState(false)

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
        // Device Trust (new device) or MFA: the password was right, but Clerk
        // wants an emailed code before it opens a session.
        if (
          res.status === "needs_client_trust" ||
          res.status === "needs_second_factor"
        ) {
          const factor = res.supportedSecondFactors?.find(
            (f) => f.strategy === "email_code"
          )
          if (factor && "emailAddressId" in factor) {
            await signIn.prepareSecondFactor({
              strategy: "email_code",
              emailAddressId: factor.emailAddressId,
            })
            setNeedsCode(true)
            return
          }
        }
        setError(m.auth_sign_in_error())
      } catch (err) {
        setError(clerkErrorMessage(err, m.auth_sign_in_error()))
      }
    },
  })

  if (needsCode) return <SecondFactorStep />

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

/** Emailed-code step shown when Clerk asks a new device to verify itself. */
function SecondFactorStep() {
  const navigate = useNavigate()
  const { signIn, setActive, isLoaded } = useSignIn()
  const [error, setError] = React.useState<string | null>(null)

  const form = useAppForm({
    defaultValues: { code: "" },
    validators: { onSubmit: verifyEmailSchema },
    onSubmit: async ({ value }) => {
      if (!isLoaded) return
      setError(null)
      try {
        const res = await signIn.attemptSecondFactor({
          strategy: "email_code",
          code: value.code,
        })
        if (res.status === "complete") {
          await setActive({ session: res.createdSessionId })
          await navigate({ to: "/app" })
          return
        }
        setError(m.auth_verify_error())
      } catch (err) {
        setError(clerkErrorMessage(err, m.auth_verify_error()))
      }
    },
  })

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          {m.auth_verify_title()}
        </h1>
        <p className="text-sm text-muted-foreground">
          {m.auth_verify_subtitle()}
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
        <form.AppField name="code">
          {(field) => (
            <field.TextField
              label={m.auth_verify_code_label()}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="••••••"
            />
          )}
        </form.AppField>
        <FormError>{error}</FormError>
        <form.AppForm>
          <form.SubmitButton pendingLabel={m.auth_verify_submitting()}>
            {m.auth_verify_submit()}
          </form.SubmitButton>
        </form.AppForm>
      </form>
    </div>
  )
}
