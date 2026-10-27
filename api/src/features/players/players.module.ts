import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { EloRating, EloRatingSchema } from "../elo/elo-rating.schema.js"
import { Player, PlayerSchema } from "./player.schema.js"
import { Profile, ProfileSchema } from "./profile.schema.js"
import { PlayerService } from "./player.service.js"
import { ProfileService } from "./profile.service.js"
import { DirectoryModule } from "../directory/directory.module.js"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Player.name, schema: PlayerSchema },
      { name: Profile.name, schema: ProfileSchema },
      { name: EloRating.name, schema: EloRatingSchema },
    ]),
    // Clerk directory: a new profile starts from the account's real name.
    DirectoryModule,
  ],
  providers: [PlayerService, ProfileService],
  exports: [PlayerService, ProfileService],
})
export class PlayersModule {}
