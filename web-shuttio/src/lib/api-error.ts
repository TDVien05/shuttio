/**
 * A non-2xx api response. The api's `AllExceptionsFilter` renders every
 * failure as `{ error: message }`, so `message` is that string and `status`
 * the HTTP status — callers branch on `status` (e.g. a 409 slot conflict).
 *
 * Kept apart from `api.ts` so the query client can use it without pulling the
 * Clerk SDK into the landing page's bundle.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = "ApiError"
  }
}
