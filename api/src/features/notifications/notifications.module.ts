import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { DirectoryModule } from "../directory/directory.module.js"
import {
  NotificationEmailEvent,
  NotificationEmailEventSchema,
} from "./email-outbox.schema.js"
import { MailerService } from "./mailer.service.js"
import { NotificationDigestService } from "./notification-digest.service.js"
import { Notification, NotificationSchema } from "./notification.schema.js"
import { NotificationsController } from "./notifications.controller.js"
import { NotificationsService } from "./notifications.service.js"

// A leaf module (no feature-module deps of its own, only the Clerk directory
// for the digest's recipient lookup) so `BookingsModule`, `VenuesModule`,
// `PaymentsModule` and `ChatModule` can each import it without a module cycle.
@Module({
  imports: [
    DirectoryModule,
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      {
        name: NotificationEmailEvent.name,
        schema: NotificationEmailEventSchema,
      },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationDigestService, MailerService],
  exports: [NotificationsService, MailerService],
})
export class NotificationsModule {}
