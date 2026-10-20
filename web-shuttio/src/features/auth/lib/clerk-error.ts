/** Clerk API errors carry `errors[0].message`; fall back to our own copy. */
export function clerkErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "errors" in err) {
    const { errors } = err
    if (Array.isArray(errors)) {
      const first: unknown = errors[0]
      if (first && typeof first === "object" && "message" in first) {
        return String(first.message)
      }
    }
  }
  return fallback
}
