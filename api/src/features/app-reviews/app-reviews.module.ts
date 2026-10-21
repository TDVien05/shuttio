import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { PlayersModule } from "../players/players.module.js"
import { DirectoryModule } from "../directory/directory.module.js"
import { AppReview, AppReviewSchema } from "./app-review.schema.js"
import {
  AdminAppReviewsController,
  AppReviewsController,
} from "./app-reviews.controller.js"
import { AppReviewsService } from "./app-reviews.service.js"

// Reviews of the app itself, shown on the landing page. `PlayersModule`
// supplies the reviewer's account type (player vs venue owner) and
// `DirectoryModule` the Clerk directory for their public display name.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AppReview.name, schema: AppReviewSchema },
    ]),
    PlayersModule,
    DirectoryModule,
  ],
  controllers: [AppReviewsController, AdminAppReviewsController],
  providers: [AppReviewsService],
})
export class AppReviewsModule {}
