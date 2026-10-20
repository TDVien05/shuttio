import { useLocation } from "@tanstack/react-router"
import { MatchMakerDialogs } from "@/features/play/components/match-maker-dialogs"
import { PlayChooser } from "@/features/play/components/play-chooser"
import { workspaceForPath } from "@/features/dashboard/lib/workspace"

/**
 * Player-workspace-only floating chrome (the Play chooser, booking wizard and
 * Match Maker dialogs). Hidden on venue
 * routes so the operator surface gets its own chrome instead. Lives inside the
 * shared SessionProvider so every floater keeps its state across player-section
 * navigation — and so the topbar can open the Quick Join / Create Room dialogs
 * from anywhere.
 */
export function PlayerChrome() {
  const pathname = useLocation({ select: (l) => l.pathname })
  if (workspaceForPath(pathname) !== "player") return null
  return (
    <>
      <PlayChooser />
      <MatchMakerDialogs />
    </>
  )
}
