import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import {
  ReliabilityEvent,
  ReliabilityEventSchema,
} from "./reliability-event.schema.js"
import { ReliabilityController } from "./reliability.controller.js"
import { ReliabilityService } from "./reliability.service.js"

// Players' show-up records (attended / no-show / late cancel). `RoomsModule`
// writes them as rooms are left, cancelled and settled, and checks them
// before letting a player join.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ReliabilityEvent.name, schema: ReliabilityEventSchema },
    ]),
  ],
  controllers: [ReliabilityController],
  providers: [ReliabilityService],
  exports: [ReliabilityService],
})
export class ReliabilityModule {}
