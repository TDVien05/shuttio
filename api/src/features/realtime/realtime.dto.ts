import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  Length,
} from "class-validator"

import { PRESENCE_MAX_USERS } from "./presence.service.js"

/** `POST /api/realtime/presence` — whose presence to read. */
export class PresenceBodyDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(PRESENCE_MAX_USERS)
  @IsString({ each: true })
  @Length(1, 128, { each: true })
  userIds: string[]
}
