import { Coins } from "lucide-react"

import { formatVnd } from "@/features/dashboard/data"
import { m } from "@/paraglide/messages"

/**
 * A booked room's court cost, split per seat. Display only — players pay the
 * venue directly and settle each other's share between themselves, so no money
 * moves through the app.
 */
export function RoomSharePanel({ sharePrice }: { sharePrice?: number }) {
  if (!sharePrice) return null
  return (
    <div className="flex items-start gap-2 rounded-2xl bg-muted/60 px-3 py-2 text-xs">
      <Coins className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div>
        <p className="font-medium">
          {m.room_share_per_seat()}: {formatVnd(sharePrice)}
        </p>
        <p className="text-muted-foreground">{m.room_share_note()}</p>
      </div>
    </div>
  )
}
