import { Module } from "@nestjs/common"

import { DirectoryModule } from "../directory/directory.module.js"
import { EloModule } from "../elo/elo.module.js"
import { PlayersModule } from "../players/players.module.js"
import { VenuesModule } from "../venues/venues.module.js"
import { AccountController } from "./account.controller.js"
import { AccountService } from "./account.service.js"
import { ChangePasswordService } from "./change-password.service.js"

@Module({
  imports: [PlayersModule, EloModule, VenuesModule, DirectoryModule],
  controllers: [AccountController],
  providers: [AccountService, ChangePasswordService],
  exports: [AccountService],
})
export class AccountModule {}
