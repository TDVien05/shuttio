import { IsNotEmpty, IsString, Length } from "class-validator"

export class EloUserIdParamDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 128)
  userId: string
}
