import { Global, Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { CentrifugoService } from "./centrifugo.service.js"
import { PresenceService } from "./presence.service.js"
import { RealtimeController } from "./realtime.controller.js"
import { UserPresence, UserPresenceSchema } from "./user-presence.schema.js"

// Global so any feature can publish without importing this module (the
// event services are provided by several modules already).
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserPresence.name, schema: UserPresenceSchema },
    ]),
  ],
  controllers: [RealtimeController],
  providers: [CentrifugoService, PresenceService],
  exports: [CentrifugoService, PresenceService],
})
export class RealtimeModule {}
