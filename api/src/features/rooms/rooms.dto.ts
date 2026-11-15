import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator"

export class RoomIdParamDto {
  @IsString()
  @IsNotEmpty()
  id: string
}

export class RoomRequestParamDto extends RoomIdParamDto {
  @IsString()
  @IsNotEmpty()
  userId: string
}

export const ROOM_REQUEST_DECISIONS = ["approve", "decline"] as const
export type RoomRequestDecision = (typeof ROOM_REQUEST_DECISIONS)[number]

export class RoomRequestDecisionBodyDto {
  @IsIn(ROOM_REQUEST_DECISIONS)
  decision: RoomRequestDecision
}

export class ChannelIdParamDto {
  @Matches(/^[\w-]{1,64}$/, { message: "Invalid channel id" })
  channelId: string
}

/** `POST /api/rooms/:id/complaints` — why the member is complaining. */
export class RoomComplaintBodyDto {
  @IsString()
  @MinLength(10, { message: "Vui lòng mô tả lý do ít nhất 10 ký tự" })
  @MaxLength(500)
  reason: string
}

export const COMPLAINT_DECISIONS = ["resolve", "dismiss"] as const
export type ComplaintDecision = (typeof COMPLAINT_DECISIONS)[number]

/** `POST /api/admin/complaints/:id/resolve`. */
export class ResolveComplaintBodyDto {
  @IsIn(COMPLAINT_DECISIONS)
  decision: ComplaintDecision

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string
}

/** `POST /api/rooms/:id/check-in` — the player's position on site. */
export class CheckInBodyDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number

  /** Reported GPS accuracy in metres, when the browser gives one. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracy?: number
}
