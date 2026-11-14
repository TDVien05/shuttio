import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { EloChange, EloChangeSchema } from "./elo-change.schema.js"
import { EloRating, EloRatingSchema } from "./elo-rating.schema.js"
import { EloController } from "./elo.controller.js"
import { EloService } from "./elo.service.js"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EloRating.name, schema: EloRatingSchema },
      { name: EloChange.name, schema: EloChangeSchema },
    ]),
  ],
  controllers: [EloController],
  providers: [EloService],
  exports: [EloService],
})
export class EloModule {}
