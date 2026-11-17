import { randomInt } from "node:crypto"

import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"

import {
  CLERK_CLIENT,
  type ClerkBackendClient,
} from "../directory/clerk-directory.service.js"
import { MUST_CHANGE_PASSWORD } from "../account/change-password.service.js"
import { MailerService } from "../notifications/mailer.service.js"
import { ProfileService } from "../players/profile.service.js"

/** Random 8-digit numeric password. */
export function generatePassword(length = 8): string {
  let out = ""
  for (let i = 0; i < length; i++) out += String(randomInt(10))
  return out
}

export interface CreatedVenueAccount {
  userId: string
  email: string
}

/**
 * Admin: provision a venue-operator (chủ sân) account. Creates the Clerk user
 * with a generated password, marks the profile as a venue account and emails
 * the credentials. If the email can't be delivered the account is rolled back
 * — otherwise nobody would ever learn the password.
 */
@Injectable()
export class VenueAccountService {
  private readonly logger = new Logger(VenueAccountService.name)

  constructor(
    @Inject(CLERK_CLIENT) private readonly clerk: ClerkBackendClient,
    private readonly mailer: MailerService,
    private readonly profiles: ProfileService,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {}

  async create(input: {
    email: string
    name?: string
  }): Promise<CreatedVenueAccount> {
    if (!this.mailer.enabled) {
      throw new ServiceUnavailableException(
        "Chưa cấu hình SMTP nên không thể gửi mật khẩu qua email"
      )
    }
    const existing = await this.clerk.users.getUserList({
      emailAddress: [input.email],
      limit: 1,
    })
    if (existing.data.length > 0) {
      throw new ConflictException("Email này đã có tài khoản")
    }

    const password = generatePassword()
    const [firstName, ...rest] = (input.name ?? "").split(/\s+/).filter(Boolean)
    const user = await this.clerk.users
      .createUser({
        emailAddress: [input.email],
        password,
        // An 8-digit numeric password fails Clerk's strength/breach checks;
        // it is temporary and must be changed at first login.
        skipPasswordChecks: true,
        publicMetadata: { [MUST_CHANGE_PASSWORD]: true },
        firstName,
        lastName: rest.join(" ") || undefined,
      })
      .catch((err: unknown) => {
        const status = (err as { status?: number })?.status
        if (status === 422) {
          throw new ConflictException(
            "Clerk từ chối tạo tài khoản (email không hợp lệ hoặc đã tồn tại)"
          )
        }
        throw err
      })

    try {
      await this.profiles.setAccountType(user.id, "venue")
      await this.mailer.send(
        input.email,
        "Tài khoản chủ sân Shuttio của bạn",
        this.body(input.email, password, input.name)
      )
    } catch (err) {
      this.logger.error(
        `Venue account for ${user.id} rolled back: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
      await this.clerk.users.deleteUser(user.id).catch(() => undefined)
      throw new ServiceUnavailableException(
        "Không gửi được email nên tài khoản chưa được tạo — vui lòng thử lại"
      )
    }
    return { userId: user.id, email: input.email }
  }

  private body(email: string, password: string, name?: string): string {
    const url =
      (this.config.get<string>("WEB_URL") ?? "").split(",")[0]?.trim() ?? ""
    return [
      `Xin chào${name ? ` ${name}` : ""},`,
      "",
      "Quản trị viên đã tạo tài khoản chủ sân Shuttio cho bạn.",
      "",
      `Email đăng nhập: ${email}`,
      `Mật khẩu tạm thời: ${password}`,
      "",
      url ? `Đăng nhập tại: ${url}` : "",
      "Bạn sẽ được yêu cầu đổi mật khẩu ngay trong lần đăng nhập đầu tiên.",
    ].join("\n")
  }
}
