import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { PlayView } from "@/features/play/components/play"
import { pageTitle } from "@/lib/head"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authenticated/app/play")({
  validateSearch: z.object({ tab: z.enum(["courts", "rooms"]).optional() }),
  head: () => pageTitle(m.play_meta_title(), m.play_meta_description()),
  component: PlayPage,
})

function PlayPage() {
  const { tab } = Route.useSearch()
  return <PlayView initialTab={tab ?? "courts"} />
}
