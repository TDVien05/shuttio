import * as React from "react"
import { ImagePlus, Images, Star, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  useVenueData,
  useSaveVenuePhotos,
} from "@/features/venue/api/venue.queries"
import { VenuePanel } from "@/features/venue/components/shared"
import { signVenuePhotoUpload } from "@/features/venue/api/venue-api"
import { m } from "@/paraglide/messages"

/** Mirrors the api's MAX_VENUE_PHOTOS (venue-photos.service.ts). */
const MAX_PHOTOS = 8
/** Largest file accepted before upload (Cloudinary's free plan caps at 10MB). */
const MAX_BYTES = 5 * 1024 * 1024
const ACCEPT = "image/jpeg,image/png,image/webp"

/** Upload one file straight to Cloudinary with a fresh api-made signature. */
async function uploadPhoto(venueId: string, file: File): Promise<string> {
  const sig = await signVenuePhotoUpload(venueId)
  const form = new FormData()
  form.append("file", file)
  form.append("api_key", sig.apiKey)
  form.append("timestamp", String(sig.timestamp))
  form.append("folder", sig.folder)
  form.append("allowed_formats", sig.allowedFormats)
  form.append("signature", sig.signature)
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`,
    { method: "POST", body: form }
  )
  const body = (await res.json().catch(() => null)) as {
    secure_url?: string
    error?: { message?: string }
  } | null
  if (!res.ok || !body?.secure_url) {
    throw new Error(body?.error?.message ?? "Upload failed")
  }
  return body.secure_url
}

/**
 * The operator's photo gallery for the current branch — illustrative photos
 * players see on the court cards and the booking page. The first photo is
 * the cover. Files upload browser → Cloudinary directly; the api signs each
 * upload and stores the resulting URLs.
 */
export function VenuePhotosPanel() {
  const { venueId, venue } = useVenueData()
  const savePhotos = useSaveVenuePhotos(venueId)
  // Pending un-saved edits only; the saved list is the query's `venue.photos`.
  const [draft, setDraft] = React.useState<string[] | null>(null)
  const [uploading, setUploading] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const photos = draft ?? venue.photos ?? []
  const saving = savePhotos.isPending
  const busy = uploading > 0 || saving
  const remaining = MAX_PHOTOS - photos.length

  const persist = (next: string[], successMessage: string) => {
    const previous = draft
    setDraft(next)
    savePhotos.mutate(next, {
      onSuccess: (saved) => {
        setDraft(saved)
        toast.success(successMessage)
      },
      onError: (err) => {
        setDraft(previous)
        toast.error(
          err instanceof Error ? err.message : m.venue_photos_save_error()
        )
      },
    })
  }

  const onFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? [])
    if (inputRef.current) inputRef.current.value = ""
    if (!files.length) return

    const accepted = files.filter((f) => ACCEPT.split(",").includes(f.type))
    const sized = accepted.filter((f) => f.size <= MAX_BYTES)
    if (sized.length < files.length) {
      toast.error(m.venue_photos_rejected({ mb: MAX_BYTES / 1024 / 1024 }))
    }
    const batch = sized.slice(0, remaining)
    if (sized.length > remaining) {
      toast.error(m.venue_photos_too_many({ max: MAX_PHOTOS }))
    }
    if (!batch.length) return

    setUploading(batch.length)
    const results = await Promise.allSettled(
      batch.map((file) => uploadPhoto(venueId, file))
    )
    setUploading(0)
    const urls = results.flatMap((r) =>
      r.status === "fulfilled" ? [r.value] : []
    )
    if (urls.length < batch.length) toast.error(m.venue_photos_upload_error())
    if (urls.length) {
      persist(
        [...photos, ...urls],
        m.venue_photos_uploaded({ count: urls.length })
      )
    }
  }

  return (
    <VenuePanel
      title={m.venue_photos_title()}
      icon={Images}
      action={
        <Button
          shape="pill"
          size="sm"

          isDisabled={busy || remaining <= 0}
          onPress={() => inputRef.current?.click()}
        >
          {uploading > 0 ? <Spinner /> : <ImagePlus className="size-4" />}
          {uploading > 0
            ? m.venue_photos_uploading({ count: uploading })
            : m.venue_photos_add()}
        </Button>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => void onFiles(e.target.files)}
      />
      <p className="-mt-1 text-xs text-muted-foreground">
        {m.venue_photos_hint({ max: MAX_PHOTOS })}
      </p>

      {photos.length === 0 ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/40"
        >
          <ImagePlus className="size-6" />
          {m.venue_photos_empty()}
        </button>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((url, i) => (
            <li
              key={url}
              className="group relative aspect-4/3 overflow-hidden rounded-2xl bg-muted ring-1 ring-foreground/5"
            >
              <img
                src={url}
                alt={m.venue_photos_photo_alt({ name: venue.name, n: i + 1 })}
                className="absolute inset-0 size-full object-cover"
              />
              {i === 0 ? (
                <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-mini font-medium text-white">
                  {m.venue_photos_cover()}
                </span>
              ) : null}
              <div
                className={cn(
                  "absolute inset-x-2 bottom-2 flex justify-end gap-1.5 transition-opacity",
                  "opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
                )}
              >
                {i > 0 ? (
                  <Button
                    shape="pill"
                    size="icon-sm"
                    variant="secondary"

                    isDisabled={busy}
                    aria-label={m.venue_photos_make_cover()}
                    onPress={() =>
                      persist(
                        [url, ...photos.filter((p) => p !== url)],
                        m.venue_photos_cover_set()
                      )
                    }
                  >
                    <Star />
                  </Button>
                ) : null}
                <Button
                  shape="pill"
                  size="icon-sm"
                  variant="destructive"

                  isDisabled={busy}
                  aria-label={m.venue_photos_remove()}
                  onPress={() =>
                    persist(
                      photos.filter((p) => p !== url),
                      m.venue_photos_removed()
                    )
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </VenuePanel>
  )
}
