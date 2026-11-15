import { Controller, Get, Inject, Param } from "@nestjs/common"
import { IsNotEmpty, IsString } from "class-validator"

import { ReliabilityService } from "./reliability.service.js"

export class ReliabilityUserParamDto {
  @IsString()
  @IsNotEmpty()
  userId: string
}

// Any signed-in player may read another's show-up record — a host checks it
// before letting a stranger into their room.
@Controller("reliability")
export class ReliabilityController {
  constructor(
    @Inject(ReliabilityService) private readonly reliability: ReliabilityService
  ) {}

  @Get(":userId")
  summary(@Param() param: ReliabilityUserParamDto) {
    return this.reliability.summary(param.userId)
  }
}
