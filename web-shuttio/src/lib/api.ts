import { getToken } from "@clerk/react"

import { API_URL } from "@/env"

export { API_URL }

/** Fail fast instead of hanging a screen on an unreachable api. */
export const API_TIMEOUT_MS = 15_000

/**
 * A non-2xx api response. The api's `AllExceptionsFilter` renders every
 * failure as `{ error: message }`, so `message` is that string and `status`
 * the HTTP status — callers branch on `status` (e.g. a 409 slot conflict).
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

export interface ApiInit {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  /** JSON-serialized into the request body. */
  body?: unknown
  query?: Record<string, string | number | boolean | undefined | null>
  signal?: AbortSignal
  /** Skip the Clerk bearer token (for the api's `@Public()` routes). */
  anonymous?: boolean
}

/** Absolute api URL for `path`, with `query` appended. */
export function apiUrl(path: string, query?: ApiInit["query"]) {
  const url = new URL(path, API_URL)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

/** `Authorization` header carrying the signed-in user's Clerk session token. */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * Call the NestJS api straight from the browser. Every route except the
 * `@Public()` ones requires the Clerk session token, attached here. Resolves
 * to the parsed JSON body (or `undefined` for an empty response) and throws an
 * {@link ApiError} on any non-2xx status.
 */
export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const headers: Record<string, string> = init.anonymous
    ? {}
    : await authHeaders()
  if (init.body !== undefined) headers["Content-Type"] = "application/json"

  const timeout = AbortSignal.timeout(API_TIMEOUT_MS)
  const res = await fetch(apiUrl(path, init.query), {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
  })

  const text = await res.text()
  const data: unknown = text ? JSON.parse(text) : undefined
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String(data.error)
        : `Request failed (${res.status})`
    throw new ApiError(res.status, message)
  }
  return data as T
}

/** The outcome of a mutation whose caller branches on the HTTP status. */
export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; status: number; message: string }

/** {@link api}, but resolving to an {@link ApiResult} instead of throwing. */
export async function apiResult<T>(
  path: string,
  init?: ApiInit
): Promise<ApiResult<T>> {
  try {
    return { ok: true, data: await api<T>(path, init) }
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, status: err.status, message: err.message }
    }
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : "Request failed",
    }
  }
}
