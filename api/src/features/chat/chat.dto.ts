import { Type } from "class-transformer"
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator"

import { MAX_MESSAGE_LENGTH, MAX_PAGE_SIZE } from "./chat-messages.service.js"

// ── Real room-chat lifecycle (quyết định #13) — no mock seeding, every
// mutation authorized against the channel's `created_by` (the host). ──────

export class CreateRoomBodyDto {
  @Matches(/^[\w-]{1,64}$/, { message: "Invalid channel id" })
  id: string

  @IsString()
  @Length(1, 80)
  name: string
}

export class RoomMemberBodyDto {
  @Matches(/^[\w-]{1,64}$/, { message: "Invalid channel id" })
  channelId: string

  @IsString()
  @Length(1, 128)
  memberId: string
}

export class RoomFreezeBodyDto {
  @Matches(/^[\w-]{1,64}$/, { message: "Invalid channel id" })
  channelId: string
}

// ── Community chat: user search, DMs/groups, venue chat ──────────────────

export class UserSearchQueryDto {
  @IsString()
  @Length(3, 64)
  q: string
}

export class CreateConversationBodyDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  @Length(1, 128, { each: true })
  memberIds: string[]

  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string
}

// Leave a group / delete a DM for the caller — channelId only; the caller is
// always the user being removed (asserted server-side against the token).
export class LeaveConversationBodyDto {
  @Matches(/^[\w-]{1,64}$/, { message: "Invalid channel id" })
  channelId: string
}

export class VenueChatBodyDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  venueId?: string

  @IsOptional()
  @IsString()
  @Length(1, 64)
  bookingId?: string
}

// ── Group management ─────────────────────────────────────────────────────

export class RenameGroupBodyDto {
  @Matches(/^[\w-]{1,64}$/, { message: "Invalid channel id" })
  channelId: string

  @IsString()
  @Length(1, 80)
  name: string
}

export class DeleteGroupBodyDto {
  @Matches(/^[\w-]{1,64}$/, { message: "Invalid channel id" })
  channelId: string
}

export class AddGroupMembersBodyDto {
  @Matches(/^[\w-]{1,64}$/, { message: "Invalid channel id" })
  channelId: string

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  @Length(1, 128, { each: true })
  memberIds: string[]
}

// ── Messages ─────────────────────────────────────────────────────────────

export class ChannelParamDto {
  @Matches(/^[\w-]{1,64}$/, { message: "Invalid channel id" })
  channelId: string
}

export class ListChannelsQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  venueId?: string
}

export class ListMessagesQueryDto {
  /** Message id: the page ends just before it. */
  @IsOptional()
  @IsString()
  @Length(24, 24)
  before?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number
}

export class ImageRefDto {
  @IsString()
  @Length(1, 200)
  publicId: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version: number

  @IsString()
  @Length(2, 5)
  format: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20_000)
  width?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20_000)
  height?: number
}

export class SendMessageBodyDto {
  @IsOptional()
  @IsString()
  @Length(0, MAX_MESSAGE_LENGTH)
  text?: string

  @IsOptional()
  @ValidateNested()
  @Type(() => ImageRefDto)
  image?: ImageRefDto
}
