import { z } from "zod"

import { m } from "@/paraglide/messages"

// Messages are functions so they resolve in the active locale at validation time.
export const signInSchema = z.object({
  email: z.email({ error: () => m.auth_validation_email() }),
  password: z.string().min(1, { error: () => m.auth_validation_required() }),
})

export const adminSignInSchema = z.object({
  email: z.email({ error: () => m.auth_validation_email() }),
  password: z.string().min(1, { error: () => m.auth_validation_required() }),
})

export const credentialsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: () => m.auth_validation_required() }),
  email: z.email({ error: () => m.auth_validation_email() }),
  password: z
    .string()
    .min(8, { error: () => m.auth_validation_password_min() }),
})

export const verifyEmailSchema = z.object({
  code: z.string().regex(/^\d{6}$/, { error: () => m.auth_validation_code() }),
})

export const requestResetSchema = z.object({
  email: z.email({ error: () => m.auth_validation_email() }),
})

export const resetPasswordSchema = z.object({
  code: z.string().regex(/^\d{6}$/, { error: () => m.auth_validation_code() }),
  password: z
    .string()
    .min(8, { error: () => m.auth_validation_password_min() }),
})

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, { error: () => m.auth_validation_required() }),
    newPassword: z
      .string()
      .min(8, { error: () => m.auth_validation_password_min() }),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    path: ["confirm"],
    error: () => m.auth_change_password_mismatch(),
  })
