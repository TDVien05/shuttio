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
import { MailerService } from "../notifications/mailer.service.js"
import { ProfileService } from "../players/profile.service.js"

const LOWER = "abcdefghijkmnopqrstuvwxyz"
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"
const DIGITS = "23456789"
const SYMBOLS = "!@#$%*?"

/** Random 16-char password with every character class (no look-alikes). */
export function generatePassword(length = 16): string {
  const pick = (set: string) => set[randomInt(set.length)]
  const all = LOWER + UPPER + DIGITS + SYMBOLS
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)]
  while (chars.length < length) chars.push(pick(all))
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join("")
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
      "Vì lý do bảo mật, vui lòng đổi mật khẩu ngay sau lần đăng nhập đầu tiên.",
    ].join("\n")
  }
}
