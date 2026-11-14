import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from "class-validator"

export class CreateRatingBodyDto {
  @IsString()
  @Length(1, 128)
  sessionId: string

  @IsString()
  @Length(1, 128)
  rateeId: string

  @IsInt()
  @Min(1)
  @Max(5)
  stars: number

  @IsOptional()
  @IsString()
  @Length(0, 300)
  comment?: string

  /** −1 weaker than / 0 matches / +1 stronger than the displayed level. */
  @IsOptional()
  @IsIn([-1, 0, 1])
  skillVote?: number
}

export class SessionIdParamDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string
}

/** `GET /api/ratings/users/:userId/reviews` — which page to read. */
export class ReviewsQueryDto {
  /** `nextCursor` of the previous page: "<createdAt ms>_<review id>". */
  @IsOptional()
  @Matches(/^d{1,15}_[a-f0-9]{24}$/, { message: "Invalid cursor" })
  cursor?: string
}

export class UserIdParamDto {
  @IsString()
  @IsNotEmpty()
  userId: string
}
