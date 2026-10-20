import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useSignIn } from "@clerk/react/legacy"
import { z } from "zod"

import { FormError, useAppForm } from "@/components/form"
import { m } from "@/paraglide/messages"

import { clerkErrorMessage } from "./clerk-error"

// Messages are functions so they resolve in the active locale at validation time.
const requestResetSchema = z.object({
  email: z.email({ error: () => m.auth_validation_email() }),
})

const resetPasswordSchema = z.object({
  code: z.string().regex(/^\d{6}$/, { error: () => m.auth_validation_code() }),
  password: z
    .string()
    .min(8, { error: () => m.auth_validation_password_min() }),
})

// Clerk resets passwords with an emailed 6-digit code (no reset URL/token), so
// the whole flow lives here as two steps.
export function ForgotPasswordForm() {
  const [sent, setSent] = React.useState(false)

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          {sent ? m.auth_reset_title() : m.auth_forgot_title()}
        </h1>
        <p className="text-sm text-muted-foreground">
          {sent ? m.auth_forgot_code_subtitle() : m.auth_forgot_subtitle()}
        </p>
      </div>

      {sent ? <ResetStep /> : <RequestStep onSent={() => setSent(true)} />}

      <p className="text-center text-sm text-muted-foreground">
        <Link
          to="/sign-in"
          className="font-medium text-primary hover:underline"
        >
          {m.auth_forgot_back_to_sign_in()}
        </Link>
      </p>
    </div>
  )
}

function RequestStep({ onSent }: { onSent: () => void }) {
  const { signIn, isLoaded } = useSignIn()
  const [error, setError] = React.useState<string | null>(null)

  const form = useAppForm({
    defaultValues: { email: "" },
    validators: { onSubmit: requestResetSchema },
    onSubmit: async ({ value }) => {
      if (!isLoaded) return
      setError(null)
      try {
        await signIn.create({
          strategy: "reset_password_email_code",
          identifier: value.email,
        })
        onSent()
      } catch (err) {
        setError(clerkErrorMessage(err, m.auth_forgot_error()))
      }
    },
  })

  return (
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

      <FormError>{error}</FormError>

      <form.AppForm>
        <form.SubmitButton pendingLabel={m.auth_forgot_submitting()}>
          {m.auth_forgot_submit()}
        </form.SubmitButton>
      </form.AppForm>
    </form>
  )
}

function ResetStep() {
  const navigate = useNavigate()
  const { signIn, setActive, isLoaded } = useSignIn()
  const [error, setError] = React.useState<string | null>(null)

  const form = useAppForm({
    defaultValues: { code: "", password: "" },
    validators: { onSubmit: resetPasswordSchema },
    onSubmit: async ({ value }) => {
      if (!isLoaded) return
      setError(null)
      try {
        const res = await signIn.attemptFirstFactor({
          strategy: "reset_password_email_code",
          code: value.code,
          password: value.password,
        })
        if (res.status === "complete") {
          await setActive({ session: res.createdSessionId })
          await navigate({ to: "/app" })
          return
        }
        setError(m.auth_forgot_code_error())
      } catch (err) {
        setError(clerkErrorMessage(err, m.auth_forgot_code_error()))
      }
    },
  })

  return (
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
      <form.AppField name="password">
        {(field) => (
          <field.TextField
            label={m.auth_reset_password_label()}
            type="password"
            autoComplete="new-password"
            placeholder={m.auth_password_placeholder()}
          />
        )}
      </form.AppField>

      <FormError>{error}</FormError>

      <form.AppForm>
        <form.SubmitButton pendingLabel={m.auth_reset_submitting()}>
          {m.auth_reset_submit()}
        </form.SubmitButton>
      </form.AppForm>
    </form>
  )
}
