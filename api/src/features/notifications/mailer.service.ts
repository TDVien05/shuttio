import { Inject, Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import nodemailer, { type Transporter } from "nodemailer"

/**
 * Sends plain-text email over SMTP. Works with any provider that offers SMTP
 * (free tiers included), so the provider can change with env vars only. When
 * SMTP isn't configured, `enabled` is false and the digest job skips sending.
 */
@Injectable()
export class MailerService {
  private readonly transport: Transporter | null
  private readonly from: string | null

  constructor(@Inject(ConfigService) config: ConfigService) {
    const host = config.get<string>("SMTP_HOST")
    this.from = config.get<string>("MAIL_FROM") ?? null
    const port = config.get<number>("SMTP_PORT") ?? 587
    const user = config.get<string>("SMTP_USER")
    this.transport =
      host && this.from
        ? nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: user
              ? { user, pass: config.get<string>("SMTP_PASSWORD") }
              : undefined,
          })
        : null
  }

  get enabled(): boolean {
    return this.transport !== null
  }

  async send(to: string, subject: string, text: string): Promise<void> {
    if (!this.transport || !this.from) {
      throw new Error("SMTP is not configured")
    }
    await this.transport.sendMail({ from: this.from, to, subject, text })
  }
}
