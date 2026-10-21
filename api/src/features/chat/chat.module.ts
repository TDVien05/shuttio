import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"

import { Booking, BookingSchema } from "../bookings/booking.schema.js"
import { Brand, BrandSchema } from "../brands/brand.schema.js"
import { DirectoryModule } from "../directory/directory.module.js"
import { NotificationsModule } from "../notifications/notifications.module.js"
import { Venue, VenueSchema } from "../venues/venue.schema.js"
import { ChatEventsService } from "./chat-events.service.js"
import { ChatImagesService } from "./chat-images.service.js"
import { ChatMessagesService } from "./chat-messages.service.js"
import { ChatController } from "./chat.controller.js"
import {
  ChatChannel,
  ChatChannelSchema,
  ChatMember,
  ChatMemberSchema,
  ChatMessage,
  ChatMessageSchema,
} from "./chat.schema.js"
import { ChatService } from "./chat.service.js"

// Chat: conversations, members and messages in MongoDB, realtime delivery via
// Centrifugo (`RealtimeModule`, global). Venue/Booking/Brand schemas are
// registered directly here (not via VenuesModule/BookingsModule) — venues and
// bookings both import ChatModule (cancel/decline freezes room chats, booking
// milestones post into chat), so importing either back would be circular.
@Module({
  imports: [
    DirectoryModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: ChatChannel.name, schema: ChatChannelSchema },
      { name: ChatMember.name, schema: ChatMemberSchema },
      { name: ChatMessage.name, schema: ChatMessageSchema },
      { name: Venue.name, schema: VenueSchema },
      { name: Booking.name, schema: BookingSchema },
      { name: Brand.name, schema: BrandSchema },
    ]),
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatMessagesService,
    ChatEventsService,
    ChatImagesService,
  ],
  exports: [ChatService, ChatMessagesService, ChatImagesService],
})
export class ChatModule {}
