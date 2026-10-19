import { Body, Controller, Get, Post } from "@nestjs/common"

import { LookupAccountDto } from "./banks.dto.js"
import { BanksService } from "./banks.service.js"

// The bank picker's data, under /api/banks (any signed-in user).
@Controller("banks")
export class BanksController {
  constructor(private readonly banks: BanksService) {}

  @Get()
  list() {
    return this.banks.list()
  }

  /** Look up the account holder name for a VietQR-reachable account. */
  @Post("lookup")
  async lookup(@Body() dto: LookupAccountDto) {
    const accountName = await this.banks.lookup(dto.bin, dto.accountNumber)
    return { accountName }
  }
}
