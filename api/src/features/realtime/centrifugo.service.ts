import { Inject, Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { createHmac } from "node:crypto"

import { userNotificationsChannel } from "./channels.js"

/**
 * Short-lived on purpose: the client refreshes via `getToken` before expiry, so
 * a leaked token (or a user we stop trusting) is good for minutes, not hours.
 */
export const CONNECTION_TOKEN_TTL_SECONDS = 10 * 60

/**
 * `iss` / `aud` claims. Centrifugo verifies them (`client.token.issuer` /
 * `client.token.audience` in centrifugo/config.json) so a token minted by
 * anything else sharing the secret is refused.
 */
export const TOKEN_ISSUER = "shuttio-api"
export const TOKEN_AUDIENCE = "centrifugo"

const PUBLISH_TIMEOUT_MS = 3_000

const b64url = (value: string | Buffer) =>
  Buffer.from(value).toString("base64url")

/**
 * Server side of the Centrifugo integration: publishes over its HTTP API and
 * signs the browser's connection JWTs (HS256, shared secret) locally.
 */
@Injectable()
export class CentrifugoService {
  private readonly logger = new Logger(CentrifugoService.name)

  // Explicit tokens: tsx-based runners don't emit the constructor metadata
  // implicit injection relies on.
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  /**
   * Publish `data` to `channel`. Best-effort: realtime is a nudge on top of
   * state that is already persisted, so a Centrifugo outage is logged and
   * swallowed rather than failing the mutation that triggered it.
   */
  async publish(channel: string, data: unknown): Promise<void> {
    try {
      const res = await fetch(
        this.config.getOrThrow<string>("CENTRIFUGO_API_URL"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": this.config.getOrThrow<string>("CENTRIFUGO_API_KEY"),
          },
          body: JSON.stringify({
            method: "publish",
            params: { channel, data },
          }),
          signal: AbortSignal.timeout(PUBLISH_TIMEOUT_MS),
        }
      )
      // Centrifugo answers 200 with `{ error }` for application-level errors.
      const body = (await res.json().catch(() => ({}))) as {
        error?: { code: number; message: string }
      }
      if (!res.ok || body.error) {
        this.logger.warn(
          `publish to ${channel} failed: ${body.error?.message ?? res.status}`
        )
      }
    } catch (err) {
      this.logger.warn(`publish to ${channel} failed: ${String(err)}`)
    }
  }

  /**
   * Drop every live connection of `userId` right now (account removed). Without
   * `reconnect`, the client stays disconnected; the next token request is
   * refused by the app's own auth. Best-effort like `publish`.
   */
  async disconnect(userId: string): Promise<void> {
    try {
      await fetch(this.config.getOrThrow<string>("CENTRIFUGO_API_URL"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.config.getOrThrow<string>("CENTRIFUGO_API_KEY"),
        },
        body: JSON.stringify({
          method: "disconnect",
          params: { user: userId },
        }),
        signal: AbortSignal.timeout(PUBLISH_TIMEOUT_MS),
      })
    } catch (err) {
      this.logger.warn(`disconnect of ${userId} failed: ${String(err)}`)
    }
  }

  /**
   * Which of `userIds` have a live connection right now, from Centrifugo's
   * presence of each user's own `personal:notifications#<id>` channel — the
   * one every signed-in client subscribes to (needs `presence: true` on the
   * `personal` namespace in centrifugo/config.json). One batched call.
   *
   * Returns `null` when Centrifugo can't be asked (outage, timeout, presence
   * not enabled), so callers can tell "unknown" from "nobody is online".
   */
  async onlineUsers(userIds: readonly string[]): Promise<Set<string> | null> {
    if (!userIds.length) return new Set()
    try {
      const base = this.config
        .getOrThrow<string>("CENTRIFUGO_API_URL")
        .replace(/\/+$/, "")
      const res = await fetch(`${base}/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.config.getOrThrow<string>("CENTRIFUGO_API_KEY"),
        },
        body: JSON.stringify({
          commands: userIds.map((id) => ({
            presence_stats: { channel: userNotificationsChannel(id) },
          })),
          parallel: true,
        }),
        signal: AbortSignal.timeout(PUBLISH_TIMEOUT_MS),
      })
      const body = (await res.json().catch(() => ({}))) as {
        replies?: {
          presence_stats?: { num_clients?: number }
          error?: { code: number; message: string }
        }[]
        error?: { code: number; message: string }
      }
      const replies = body.replies
      if (!res.ok || !replies || replies.length !== userIds.length) {
        this.logger.warn(
          `presence lookup failed: ${body.error?.message ?? res.status}`
        )
        return null
      }
      const failed = replies.find((r) => r.error)
      if (failed?.error) {
        // E.g. "not available" when presence is off for the namespace.
        this.logger.warn(`presence lookup failed: ${failed.error.message}`)
        return null
      }
      // Replies come back in command order.
      return new Set(
        userIds.filter(
          (_, i) => (replies[i].presence_stats?.num_clients ?? 0) > 0
        )
      )
    } catch (err) {
      this.logger.warn(`presence lookup failed: ${String(err)}`)
      return null
    }
  }

  /** A connection JWT for `userId` (Centrifugo's `sub` claim). */
  connectionToken(userId: string): { token: string; expiresAt: number } {
    const iat = Math.floor(Date.now() / 1000)
    const expiresAt = iat + CONNECTION_TOKEN_TTL_SECONDS
    return {
      token: this.sign({
        sub: userId,
        iss: TOKEN_ISSUER,
        aud: TOKEN_AUDIENCE,
        iat,
        exp: expiresAt,
      }),
      expiresAt,
    }
  }

  private sign(claims: Record<string, unknown>): string {
    const signingInput = `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify(claims))}`
    const signature = createHmac(
      "sha256",
      this.config.getOrThrow<string>("CENTRIFUGO_TOKEN_HMAC_SECRET")
    )
      .update(signingInput)
      .digest()
    return `${signingInput}.${b64url(signature)}`
  }
}
