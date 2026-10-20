import * as React from "react"
import { ChevronLeft, ChevronRight, Images } from "lucide-react"

import { cn } from "@/lib/utils"
import type { Court } from "@/lib/shared"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { m } from "@/paraglide/messages"

/**
 * "Photos (n)" pill that opens the venue's photo gallery, so a player can see
 * the place before booking. Renders nothing when the venue has no photos.
 * `className` positions the pill (it sits over clickable court cards; React
 * Aria's press events don't propagate, so it never also selects the card).
 */
export function CourtPhotosButton({
  court,
  className,
}: {
  court: Court
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const photos = court.photos ?? []
  if (!photos.length) return null

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className={cn(
          "pointer-events-auto h-7 gap-1 rounded-full px-2.5 text-xs",
          className
        )}
        onPress={() => setOpen(true)}
      >
        <Images className="size-3.5" />
        {m.court_photos_open({ count: photos.length })}
      </Button>
      <Dialog
        isOpen={open}
        onOpenChange={setOpen}
        className="player-play-overlay gap-4 sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>{court.name}</DialogTitle>
          <DialogDescription>
            {[court.ward, court.province].filter(Boolean).join(", ")}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so it restarts at the cover each time. */}
        {open ? <Gallery photos={photos} name={court.name} /> : null}
      </Dialog>
    </>
  )
}

function Gallery({ photos, name }: { photos: string[]; name: string }) {
  const [index, setIndex] = React.useState(0)
  const go = (delta: number) =>
    setIndex((i) => (i + delta + photos.length) % photos.length)

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-muted">
        <img
          src={photos[index]}
          alt={m.court_photos_alt({ name, n: index + 1 })}
          className="absolute inset-0 size-full object-cover"
        />
        {photos.length > 1 ? (
          <>
            <Button
              size="icon-sm"
              variant="secondary"
              className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full"
              aria-label={m.court_photos_previous()}
              onPress={() => go(-1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              size="icon-sm"
              variant="secondary"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full"
              aria-label={m.court_photos_next()}
              onPress={() => go(1)}
            >
              <ChevronRight />
            </Button>
            <span className="absolute right-3 bottom-3 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white tabular-nums">
              {index + 1}/{photos.length}
            </span>
          </>
        ) : null}
      </div>
      {photos.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((url, i) => (
            <button
              key={url}
              type="button"
              aria-label={m.court_photos_alt({ name, n: i + 1 })}
              aria-current={i === index}
              onClick={() => setIndex(i)}
              className={cn(
                "relative h-14 w-20 shrink-0 overflow-hidden rounded-xl ring-2 transition-opacity",
                i === index
                  ? "ring-brand"
                  : "opacity-70 ring-transparent hover:opacity-100"
              )}
            >
              <img
                src={url}
                alt=""
                loading="lazy"
                className="absolute inset-0 size-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
