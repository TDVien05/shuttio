import {
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator"

import { ACCOUNT_TYPES, type AccountType } from "../../shared/index.js"

export class ChooseAccountTypeDto {
  @IsIn(ACCOUNT_TYPES)
  accountType: AccountType
}

export class UpdatePhoneDto {
  @IsString()
  @IsNotEmpty()
  phone: string
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  currentPassword: string

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string
}
