import { Module } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { createClerkClient } from "@clerk/express"

import {
  CLERK_CLIENT,
  ClerkDirectoryService,
} from "./clerk-directory.service.js"

// Read-only access to Clerk's user directory (names, avatars, search) — shared
// by chat, rooms, bookings, admin and profile code.
@Module({
  providers: [
    ClerkDirectoryService,
    {
      provide: CLERK_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createClerkClient({
          secretKey: config.getOrThrow<string>("CLERK_SECRET_KEY"),
        }),
    },
  ],
  exports: [ClerkDirectoryService, CLERK_CLIENT],
})
export class DirectoryModule {}
