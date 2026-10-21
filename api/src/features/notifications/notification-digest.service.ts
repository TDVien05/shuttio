import { Inject, Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { InjectModel } from "@nestjs/mongoose"
import { Cron } from "@nestjs/schedule"
import type { Model, Types } from "mongoose"

import { ClerkDirectoryService } from "../directory/clerk-directory.service.js"
import {
  NotificationEmailEvent,
  type NotificationEmailEventDocument,
} from "./email-outbox.schema.js"
import { buildDigest, type DigestEvent } from "./digest.js"
import { MailerService } from "./mailer.service.js"

export interface DigestRunResult {
  sent: number
  skipped: number
  failed: number
}

interface LeanEvent extends DigestEvent {
  _id: Types.ObjectId
}

/**
 * Every 15 minutes, turns each user's pending notification events into one
 * summary email. Events are the buffer: a user's rows are deleted only after
 * their email was accepted, so a failed send retries on the next tick, and an
 * event that arrives mid-run waits for the following one.
 */
@Injectable()
export class NotificationDigestService {
  private readonly logger = new Logger(NotificationDigestService.name)
  private running = false

  constructor(
    @InjectModel(NotificationEmailEvent.name)
    private readonly emailModel: Model<NotificationEmailEventDocument>,
    @Inject(ClerkDirectoryService)
    private readonly directory: ClerkDirectoryService,
    @Inject(MailerService) private readonly mailer: MailerService,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {}

  @Cron("*/15 * * * *", { name: "notification-digest" })
  async runScheduled(): Promise<void> {
    try {
      const result = await this.run()
      if (result.sent || result.failed) {
        this.logger.log(
          `Digest: ${result.sent} sent, ${result.skipped} skipped, ${result.failed} failed`
        )
      }
    } catch (err) {
      this.logger.error(
        `Digest run failed: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /** One pass over every user with pending events. Public for tests and manual runs. */
  async run(): Promise<DigestRunResult> {
    const result: DigestRunResult = { sent: 0, skipped: 0, failed: 0 }
    if (!this.mailer.enabled) return result
    if (this.running) return result
    this.running = true
    try {
      const userIds = await this.emailModel.distinct("userId")
      for (const userId of userIds) {
        result[await this.digestFor(userId)] += 1
      }
      return result
    } finally {
      this.running = false
    }
  }

  private async digestFor(
    userId: string
  ): Promise<"sent" | "skipped" | "failed"> {
    const rows = await this.emailModel
      .find({ userId })
      .sort({ createdAt: 1 })
      .lean<LeanEvent[]>()
    if (!rows.length) return "skipped"

    const to = await this.directory.primaryEmail(userId)
    if (!to) return "skipped"

    const digest = buildDigest(rows, this.appUrl())
    try {
      await this.mailer.send(to, digest.subject, digest.text)
    } catch (err) {
      this.logger.error(
        `Digest email to ${userId} failed: ${err instanceof Error ? err.message : String(err)}`
      )
      return "failed"
    }
    await this.emailModel.deleteMany({
      _id: { $in: rows.map((row) => row._id) },
    })
    return "sent"
  }

  /** First configured web origin, for the "open Shuttio" link in the email. */
  private appUrl(): string {
    const first = this.config.getOrThrow<string>("WEB_URL").split(",")[0]
    return first?.trim() || "http://localhost:3000"
  }
}
