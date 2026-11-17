import { z } from "zod"

// Validated once at boot by ConfigModule.forRoot({ validate }) below — an
// invalid/missing required var fails the process immediately instead of
// surfacing as a 500 on the first request that needs it (e.g. a missing
// CLERK_SECRET_KEY previously only broke the auth guard per-request).
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CLERK_SECRET_KEY: z.string().min(1, "CLERK_SECRET_KEY is required"),
  CLERK_PUBLISHABLE_KEY: z.string().min(1, "CLERK_PUBLISHABLE_KEY is required"),
  // Centrifugo (realtime). The api publishes over its HTTP API and signs the
  // browser's connection JWTs with the shared HMAC secret.
  CENTRIFUGO_API_URL: z.string().min(1, "CENTRIFUGO_API_URL is required"),
  CENTRIFUGO_API_KEY: z
    .string()
    .min(16, "CENTRIFUGO_API_KEY must be at least 16 characters"),
  // Centrifugo recommends a random secret of 32+ bytes for HMAC tokens.
  CENTRIFUGO_TOKEN_HMAC_SECRET: z
    .string()
    .min(32, "CENTRIFUGO_TOKEN_HMAC_SECRET must be at least 32 characters"),
  WEB_URL: z.string().min(1).default("http://localhost:3000"),
  PORT: z.coerce.number().int().positive().default(6969),
  // Booking sweeper (`bookings.sweeper.ts`) SLA — decision #5: a pending
  // reservation silently auto-confirms once the venue hasn't decided within
  // this window ("silence = consent"). Overridable so dev can shrink the
  // real 30-minute SLA to seconds/minutes when exercising the sweeper.
  BOOKING_CONFIRM_SLA_MINUTES: z.coerce.number().int().positive().default(30),
  // Peer Elo sweep (`ratings/peer-elo.service.ts`): how long a match's skill
  // votes are collected before they move a player's Elo. 24 hours in
  // production; overridable so dev can shrink it to minutes when testing.
  PEER_VOTE_WINDOW_MINUTES: z.coerce.number().int().positive().default(1440),
  // OpenRouter (Vercel AI SDK provider) — powers POST /api/ai/chat. Required so a
  // missing key crashes at boot instead of 500ing the first chat request.
  OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY is required"),
  OPENROUTER_MODEL: z.string().min(1).default("xiaomi/mimo-v2.5"),
  // SMTP for the 15-minute notification digest email. Any SMTP-capable
  // provider works. Optional: without SMTP_HOST + MAIL_FROM the digest job
  // keeps events buffered and sends nothing.
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(1).optional(),
  // Cloudinary — venue photo uploads (signed direct uploads from the browser).
  // Optional so the API still boots without them; only the photo-upload
  // routes then fail with a clear 503 (VenuePhotosService).
  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),
})

export type Env = z.infer<typeof envSchema>

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n")
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }
  return result.data
}
