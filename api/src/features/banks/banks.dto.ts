import { IsString, Matches } from "class-validator"

export class LookupAccountDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: "bin phải là 6 chữ số" })
  bin: string

  @IsString()
  @Matches(/^\d{6,20}$/, { message: "Số tài khoản phải có 6–20 chữ số" })
  accountNumber: string
}
