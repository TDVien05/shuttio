import { Global, Module } from "@nestjs/common"

import { CentrifugoService } from "./centrifugo.service.js"
import { RealtimeController } from "./realtime.controller.js"

// Global so any feature can publish without importing this module (the
// event services are provided by several modules already).
@Global()
@Module({
  controllers: [RealtimeController],
  providers: [CentrifugoService],
  exports: [CentrifugoService],
})
export class RealtimeModule {}
