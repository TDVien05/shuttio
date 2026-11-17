import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import type { HydratedDocument } from "mongoose"

// When a user was last known to have the app open — one document per Clerk
// user. "Online right now" is NOT stored here: that comes live from
// Centrifugo's presence (`CentrifugoService.onlineUsers`). This only backs
// "active 5 minutes ago" for someone who is offline.
// Explicit `type:` on every @Prop (tsx/esbuild don't emit design:type).
@Schema({ collection: "user_presence" })
export class UserPresence {
  @Prop({ type: String, required: true, unique: true }) userId: string
  @Prop({ type: Date, required: true }) lastSeenAt: Date
}

export type UserPresenceDocument = HydratedDocument<UserPresence>
export const UserPresenceSchema = SchemaFactory.createForClass(UserPresence)
