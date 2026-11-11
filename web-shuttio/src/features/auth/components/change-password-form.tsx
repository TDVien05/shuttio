import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { useUser } from "@clerk/react"

import { FormError, useAppForm } from "@/components/form"
import { api } from "@/lib/api"
import { m } from "@/paraglide/messages"

import { changePasswordSchema } from "../schemas/auth.schema"

/**
 * Forced first-login step for admin-provisioned accounts: the temporary
 * emailed password must be replaced before the rest of the app opens.
 */
export function ChangePasswordForm() {
  const navigate = useNavigate()
  const { user } = useUser()
  const [error, setError] = React.useState<string | null>(null)

  const form = useAppForm({
    defaultValues: { currentPassword: "", newPassword: "", confirm: "" },
    validators: { onSubmit: changePasswordSchema },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        await api("/api/account/password", {
          method: "POST",
          body: {
            currentPassword: value.currentPassword,
            newPassword: value.newPassword,
          },
        })
        // Pull the cleared `mustChangePassword` flag into the Clerk client
        // before leaving, or the guard would bounce straight back here.
        await user?.reload()
        await navigate({ to: "/app", replace: true })
      } catch (err) {
        setError(
          err instanceof Error ? err.message : m.auth_change_password_error()
        )
      }
    },
  })

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          {m.auth_change_password_title()}
        </h1>
        <p className="text-sm text-muted-foreground">
          {m.auth_change_password_subtitle()}
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
        <form.AppField name="currentPassword">
          {(field) => (
            <field.TextField
              label={m.auth_change_password_current()}
              type="password"
              autoComplete="current-password"
            />
          )}
        </form.AppField>
        <form.AppField name="newPassword">
          {(field) => (
            <field.TextField
              label={m.auth_change_password_new()}
              type="password"
              autoComplete="new-password"
            />
          )}
        </form.AppField>
        <form.AppField name="confirm">
          {(field) => (
            <field.TextField
              label={m.auth_change_password_confirm()}
              type="password"
              autoComplete="new-password"
            />
          )}
        </form.AppField>

        <FormError>{error}</FormError>

        <form.AppForm>
          <form.SubmitButton pendingLabel={m.auth_change_password_submitting()}>
            {m.auth_change_password_submit()}
          </form.SubmitButton>
        </form.AppForm>
      </form>
    </div>
  )
}
