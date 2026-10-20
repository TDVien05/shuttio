import { useRouter } from "@tanstack/react-router"
import { ChevronRight, MapPin, Users } from "lucide-react"

import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useBooking } from "@/features/booking/components/booking"
import { m } from "@/paraglide/messages"

export function PlayChooser() {
  const { playOpen, closePlay, openBooking } = useBooking()
  const router = useRouter()

  const options = [
    {
      key: "book",
      icon: MapPin,
      title: m.play_book_court(),
      desc: m.play_book_court_desc(),
      onClick: () => openBooking(null, { fillMode: "court" }),
    },
    {
      key: "teammates",
      icon: Users,
      title: m.play_find_teammates(),
      desc: m.play_find_teammates_desc(),
      onClick: () => {
        closePlay()
        void router.navigate({ href: "/app/play" })
      },
    },
  ]

  return (
    <Dialog
      isOpen={playOpen}
      onOpenChange={(o) => !o && closePlay()}
      className="sm:max-w-md"
    >
      <DialogHeader>
        <DialogTitle>{m.play_title()}</DialogTitle>
        <DialogDescription className="sr-only">
          {m.play_title()}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={o.onClick}
            className="flex items-center gap-3 rounded-3xl border border-border p-4 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand/12 text-brand">
              <o.icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-heading font-semibold">
                {o.title}
              </span>
              <span className="block text-xs text-muted-foreground">
                {o.desc}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </Dialog>
  )
}
