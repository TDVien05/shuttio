import { useLocation } from "@tanstack/react-router"
import type { ComponentType } from "react"
import { CalendarPlus, Play, Plus, RotateCcw } from "lucide-react"

import { Button, LinkButton } from "@/components/ui/button"
import { useSessionUi } from "@/features/play/state/session-ui"
import type { SectionKey } from "@/features/dashboard/nav"
import { venueBase } from "@/features/venue/nav"
import type { VenueSectionKey } from "@/features/venue/nav"
import type { AdminSectionKey } from "@/features/admin/nav"
import { venueIdFromPath } from "@/features/dashboard/lib/workspace"
import type { Workspace } from "@/features/dashboard/lib/workspace"
import { m } from "@/paraglide/messages"

/**
 * Per-section primary actions, surfaced in the topbar.
 *
 * The dashboard used to re-render its primary CTAs *inside* each view (a Play
 * button on Overview, "New Booking" on Bookings/Command Center, the Quick
 * Join + Create Room toolbar on Match Maker) on top of a generic topbar
 * button. This module is the single home for those actions: each workspace has
 * a default action and a small registry of per-section overrides, so a section
 * declares its topbar actions in one place and the views stay duplication-free.
 */

/** Player default — open the Play chooser. */
function PlayAction() {
  const { openPlay } = useSessionUi()
  return (
    <Button shape="pill" size="sm" onPress={openPlay}>
      <Play />
      <span className="hidden sm:inline">{m.play_button()}</span>
    </Button>
  )
}

/** Clear all messages on the AI Assistant chat. */
function ClearChatAction() {
  const handleClear = () => {
    window.dispatchEvent(new CustomEvent("clear-ai-chat"))
  }
  return (
    <Button
      shape="pill"
      size="sm"
      variant="outline"

      onPress={handleClear}
    >
      <RotateCcw className="mr-1.5 size-4" />
      <span>{m.ai_dashboard_clear_chat()}</span>
    </Button>
  )
}

/**
 * Bookings primary CTA — same Play chooser, booking-flavored label. The
 * bookings route now renders the blue player header (which shows no
 * `SectionActions`), so the CTA lives in the `BookingsView` header instead and
 * this is exported for that view.
 */
export function NewBookingAction() {
  const { openPlay } = useSessionUi()
  return (
    <Button
      variant="lime"
      shape="pill"
      size="sm"
      className="h-10 shrink-0 px-5"
      onPress={openPlay}
    >
      <CalendarPlus />
      {m.bookings_new_booking()}
    </Button>
  )
}

/** Venue default — jump to the schedule to add a booking. */
function VenueNewBookingAction() {
  // The topbar lives in the shared layout (outside the venue data provider), so
  // the active venue is read from the URL rather than useVenueData().
  const pathname = useLocation({ select: (l) => l.pathname })
  const venueId = venueIdFromPath(pathname)
  if (!venueId) return null
  return (
    <LinkButton
      shape="pill"
      size="sm"

      href={`${venueBase(venueId)}/schedule`}
    >
      <Plus />
      <span className="hidden sm:inline">{m.venue_nav_new_booking()}</span>
    </LinkButton>
  )
}

/** Sections whose topbar action differs from the workspace default. */
const PLAYER_ACTIONS: Partial<Record<SectionKey, ComponentType>> = {
  dashboard: ClearChatAction,
  // Play hosts its own segmented toolbar (Matches/Courts + Quick Join), so the
  // topbar carries no extra CTA there.
  play: () => null,
  // Chat's "new conversation" CTA lives in the channel-list header — player
  // chat renders the blue header, which shows no SectionActions.
  chat: () => null,
  // Bookings' "new booking" CTA lives in the view header — bookings renders the
  // blue header, which shows no SectionActions. See `NewBookingAction`.
  bookings: () => null,
  // The booking wizard is itself the action — no topbar CTA needed.
  book: () => null,
}

const VENUE_ACTIONS: Partial<Record<VenueSectionKey, ComponentType>> = {}

// The admin workspace is read-mostly (its mutations live inline in each
// table, not as a topbar CTA) — every section renders no extra action.
const ADMIN_ACTIONS: Partial<Record<AdminSectionKey, ComponentType>> = {}
function NoAction() {
  return null
}

export function SectionActions({
  workspace,
  sectionKey,
}: {
  workspace: Workspace
  sectionKey: string
}) {
  if (workspace === "admin") {
    const Action = ADMIN_ACTIONS[sectionKey as AdminSectionKey] ?? NoAction
    return <Action />
  }
  if (workspace === "venue") {
    const Action =
      VENUE_ACTIONS[sectionKey as VenueSectionKey] ?? VenueNewBookingAction
    return <Action />
  }
  const Action = PLAYER_ACTIONS[sectionKey as SectionKey] ?? PlayAction
  return <Action />
}
