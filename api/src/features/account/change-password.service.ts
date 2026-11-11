import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common"

import {
  CLERK_CLIENT,
  type ClerkBackendClient,
} from "../directory/clerk-directory.service.js"

/** publicMetadata flag set on admin-provisioned accounts until first change. */
export const MUST_CHANGE_PASSWORD = "mustChangePassword"

/**
 * Server-side password change: verifies the current password, sets the new one
 * and clears the first-login flag. Done here (not client-side) so the flag can
 * only be cleared by a real password change — the browser can't edit
 * `publicMetadata`.
 */
@Injectable()
export class ChangePasswordService {
  constructor(
    @Inject(CLERK_CLIENT) private readonly clerk: ClerkBackendClient
  ) {}

  async change(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    if (currentPassword === newPassword) {
      throw new BadRequestException("Mật khẩu mới phải khác mật khẩu hiện tại")
    }
    const check = await this.clerk.users.verifyPassword({
      userId,
      password: currentPassword,
    })
    if (!check.verified) {
      throw new UnauthorizedException("Mật khẩu hiện tại không đúng")
    }
    await this.clerk.users
      .updateUser(userId, {
        password: newPassword,
        signOutOfOtherSessions: false,
      })
      .catch((err: unknown) => {
        const message = (err as { errors?: { message?: string }[] })
          ?.errors?.[0]?.message
        if ((err as { status?: number })?.status === 422) {
          throw new BadRequestException(message ?? "Mật khẩu mới không đủ mạnh")
        }
        throw err
      })
    await this.clerk.users.updateUserMetadata(userId, {
      publicMetadata: { [MUST_CHANGE_PASSWORD]: null },
    })
  }
}
