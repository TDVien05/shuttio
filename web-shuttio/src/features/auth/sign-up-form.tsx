import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useSignUp } from "@clerk/react/legacy"
import { z } from "zod"

import { FormError, useAppForm } from "@/components/form"
import { m } from "@/paraglide/messages"

import { AuthDivider, GoogleButton } from "./google-button"
import { clerkErrorMessage } from "./clerk-error"

// Messages are functions so they resolve in the active locale at validation time.
const credentialsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: () => m.auth_validation_required() }),
  email: z.email({ error: () => m.auth_validation_email() }),
  password: z
    .string()
    .min(8, { error: () => m.auth_validation_password_min() }),
})

const verifyEmailSchema = z.object({
  code: z.string().regex(/^\d{6}$/, { error: () => m.auth_validation_code() }),
})

// Clerk sign-up is two steps: credentials, then an emailed 6-digit code.
export function SignUpForm() {
  const [verifying, setVerifying] = React.useState(false)

  return verifying ? (
    <VerifyEmailStep />
  ) : (
    <CredentialsStep onSent={() => setVerifying(true)} />
  )
}

function CredentialsStep({ onSent }: { onSent: () => void }) {
  const { signUp, isLoaded } = useSignUp()
  const [error, setError] = React.useState<string | null>(null)

  const form = useAppForm({
    defaultValues: { name: "", email: "", password: "" },
    validators: { onSubmit: credentialsSchema },
    onSubmit: async ({ value }) => {
      if (!isLoaded) return
      setError(null)
      try {
        await signUp.create({
          firstName: value.name,
          emailAddress: value.email,
          password: value.password,
        })
        await signUp.prepareEmailAddressVerification({ strategy: "email_code" })
        onSent()
      } catch (err) {
        setError(clerkErrorMessage(err, m.auth_sign_up_error()))
      }
    },
  })

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          {m.auth_sign_up_title()}
        </h1>
        <p className="text-sm text-muted-foreground">
          {m.auth_sign_up_subtitle()}
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
        <form.AppField name="name">
          {(field) => (
            <field.TextField
              label={m.auth_sign_up_name_label()}
              autoComplete="name"
              placeholder={m.auth_sign_up_name_placeholder()}
            />
          )}
        </form.AppField>
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
              autoComplete="new-password"
              placeholder={m.auth_password_placeholder()}
            />
          )}
        </form.AppField>

        {/* Mount point for Clerk's Smart CAPTCHA (bot sign-up protection).
            Without it, signUp.create() falls back to the Invisible CAPTCHA and
            warns. Clerk renders the widget here only when a challenge is needed. */}
        <div id="clerk-captcha" />

        <FormError>{error}</FormError>

        <form.AppForm>
          <form.SubmitButton pendingLabel={m.auth_sign_up_submitting()}>
            {m.auth_sign_up_submit()}
          </form.SubmitButton>
        </form.AppForm>
      </form>

      <HaveAccount />
    </div>
  )
}

function VerifyEmailStep() {
  const navigate = useNavigate()
  const { signUp, setActive, isLoaded } = useSignUp()
  const [error, setError] = React.useState<string | null>(null)

  const form = useAppForm({
    defaultValues: { code: "" },
    validators: { onSubmit: verifyEmailSchema },
    onSubmit: async ({ value }) => {
      if (!isLoaded) return
      setError(null)
      try {
        const res = await signUp.attemptEmailAddressVerification({
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

      <HaveAccount />
    </div>
  )
}

function HaveAccount() {
  return (
    <p className="text-center text-sm text-muted-foreground">
      {m.auth_sign_up_have_account()}{" "}
      <Link to="/sign-in" className="font-medium text-primary hover:underline">
        {m.auth_sign_up_sign_in_link()}
      </Link>
    </p>
  )
}
