import { Module } from "@nestjs/common"

import { EloModule } from "../elo/elo.module.js"
import { PlayersModule } from "../players/players.module.js"
import { VenuesModule } from "../venues/venues.module.js"
import { AccountController } from "./account.controller.js"
import { AccountService } from "./account.service.js"

@Module({
  imports: [PlayersModule, EloModule, VenuesModule],
  controllers: [AccountController],
  providers: [AccountService],
  exports: [AccountService],
})
export class AccountModule {}
