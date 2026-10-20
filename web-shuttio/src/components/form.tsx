import * as React from "react"
import { createFormHook, createFormHookContexts } from "@tanstack/react-form"

import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/**
 * The app's TanStack Form kit. Build forms with `useAppForm` and render
 * fields through `form.AppField` so every input wires value/blur/errors the
 * same way:
 *
 * ```tsx
 * const form = useAppForm({ defaultValues, validators, onSubmit })
 * <form.AppField name="email">
 *   {(field) => <field.TextField label="Email" type="email" />}
 * </form.AppField>
 * <form.AppForm><form.SubmitButton>Lưu</form.SubmitButton></form.AppForm>
 * ```
 */
export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts()

/** Normalize TanStack Form errors (strings or Standard Schema issues). */
export function toFieldErrors(errors: unknown[]) {
  return errors.map((error) =>
    typeof error === "string"
      ? { message: error }
      : error && typeof error === "object" && "message" in error
        ? { message: String(error.message) }
        : undefined
  )
}

type TextFieldProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "onBlur" | "name" | "id"
> & {
  label: React.ReactNode
  /** Rendered on the label's row, right-aligned (e.g. a "Forgot?" link). */
  labelAction?: React.ReactNode
}

function TextField({
  label,
  labelAction,
  className,
  ...props
}: TextFieldProps) {
  const field = useFieldContext<string>()
  const id = React.useId()
  const invalid = field.state.meta.isTouched && !field.state.meta.isValid

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {labelAction}
      </div>
      <Input
        id={id}
        name={field.name}
        value={field.state.value}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
        aria-invalid={invalid || undefined}
        {...props}
      />
      {invalid ? (
        <FieldError errors={toFieldErrors(field.state.meta.errors)} />
      ) : null}
    </div>
  )
}

function SubmitButton({
  children,
  pendingLabel,
  className,
  size = "lg",
}: {
  children: React.ReactNode
  /** Shown while the submit handler runs. */
  pendingLabel?: React.ReactNode
  className?: string
  size?: React.ComponentProps<typeof Button>["size"]
}) {
  const form = useFormContext()

  return (
    <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting] as const}>
      {([canSubmit, isSubmitting]) => (
        <Button
          type="submit"
          size={size}
          className={cn("w-full", className)}
          isDisabled={!canSubmit || isSubmitting}
        >
          {isSubmitting && pendingLabel ? pendingLabel : children}
        </Button>
      )}
    </form.Subscribe>
  )
}

/** A form-level error (e.g. Clerk rejecting the credentials). */
export function FormError({ children }: { children: React.ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="text-sm text-destructive">
      {children}
    </p>
  )
}

export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField },
  formComponents: { SubmitButton },
})
