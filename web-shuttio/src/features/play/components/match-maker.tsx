import { CourtDistance } from "@/features/dashboard/components/court-distance"

import * as React from "react"
import {
  Check,
  Clock,
  Eye,
  Hourglass,
  LogOut,
  MapPin,
  Plus,
  Users,
  X,
  Zap,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarGroup } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  LevelChip,
  SportTag,
  dayWordLabel,
  formatLabel,
} from "@/features/dashboard/components/shared"
import { formatVnd } from "@/lib/shared"
import type { MatchRoom } from "@/lib/shared"
import { RoomPreviewSheet } from "@/features/play/components/active-room"
import { useSessionData } from "@/features/play/hooks/use-session-data"
import { useSessionActions } from "@/features/play/hooks/use-session-actions"
import { useSessionUi } from "@/features/play/state/session-ui"
import { useAuthUser } from "@/features/dashboard/hooks/use-auth-user"
import { useData } from "@/features/dashboard/components/data-provider"
import { usePresence } from "@/features/presence/presence"
import { m } from "@/paraglide/messages"

export function RoomsView() {
  const { rooms, joinedIds, requestedIds, hostedIds, hasTimeConflict } =
    useSessionData()
  const { joinRoom, leaveRoom, openManager } = useSessionActions()
  const { openQuickJoin, openCreateRoom } = useSessionUi()
  // Kept separately from `open` so the sheet still has its room while it
  // animates closed.
  const [preview, setPreview] = React.useState<{
    id: string | null
    open: boolean
  }>({ id: null, open: false })
  // Is each room's host around right now? One query for the whole grid.
  const hostIdOf = (room: MatchRoom) =>
    room.members?.find((member) => member.host)?.userId
  const presence = usePresence(rooms.flatMap((room) => hostIdOf(room) ?? []))
  return (
    <div className="no-scrollbar flex flex-col gap-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
      <RoomPreviewSheet
        roomId={preview.id}
        open={preview.open}
        onOpenChange={(open) => setPreview((p) => ({ ...p, open }))}
      />
      {/* Room grid */}
      {rooms.length ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rooms.map((room) => {
            const hosted = hostedIds.has(room.id)
            const requested = !hosted && requestedIds.has(room.id)
            const joined = !hosted && joinedIds.has(room.id) && !requested
            return (
              <RoomCard
                key={room.id}
                room={room}
                hostOnline={
                  !hosted &&
                  (presence.get(hostIdOf(room) ?? "")?.online ?? false)
                }
                hosted={hosted}
                joined={joined}
                requested={requested}
                // Only surface a time clash for rooms the user isn't already in
                // — a room they've joined or requested is itself a commitment and
                // shouldn't read as "conflicting" with the join button.
                conflict={
                  !hosted && !joined && !requested && hasTimeConflict(room)
                }
                onJoin={() => joinRoom(room)}
                onLeave={() => leaveRoom(room.id)}
                // Rooms I'm in open the manager (the pill's sheet); any other
                // room opens the same details read-only, with a join action.
                onOpen={() =>
                  hosted || joined
                    ? openManager(room.id)
                    : setPreview({ id: room.id, open: true })
                }
              />
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-panel border border-dashed border-border bg-card px-4 py-14 text-center">
          <div className="grid size-11 place-items-center rounded-2xl bg-brand/10 text-brand">
            <Users className="size-5" />
          </div>
          <p className="text-sm text-muted-foreground">
            {m.match_maker_empty_rooms()}
          </p>
          <div className="flex items-center gap-2">
            <Button shape="pill" size="sm" onPress={openQuickJoin}>
              <Zap />
              {m.match_maker_find_match()}
            </Button>
            <Button
              shape="pill"
              size="sm"
              variant="outline"

              onPress={openCreateRoom}
            >
              <Plus />
              {m.match_maker_host_one()}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function RoomCard({
  room,
  hostOnline,
  hosted,
  joined,
  requested,
  conflict,
  onJoin,
  onLeave,
  onOpen,
}: {
  room: MatchRoom
  /** The host has the app open right now (never set for one's own room). */
  hostOnline: boolean
  hosted: boolean
  joined: boolean
  requested: boolean
  conflict: boolean
  onJoin: () => void
  onLeave: () => void
  onOpen: () => void
}) {
  const sUser = useAuthUser()
  const { userName } = useSessionData()
  const { courtByVenue } = useData()
  const court = courtByVenue(room.venue)
  const address = court
    ? [court.ward, court.province].filter(Boolean).join(", ")
    : room.ward
  const [leaveHint, setLeaveHint] = React.useState(false)
  const full = room.joined >= room.capacity
  const openSeats = room.capacity - room.joined
  const title = room.title
  const day = dayWordLabel(room.day)

  return (
    <div className="relative flex cursor-pointer flex-col gap-4 rounded-panel border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SportTag sport={room.sport} />
            <span className="text-xs text-muted-foreground">
              · {formatLabel(room.format)}
            </span>
            {room.demo ? (
              <span
                className="rounded-full bg-muted px-2 py-0.5 font-mono text-micro font-medium tracking-wider text-muted-foreground uppercase"
                title={m.match_maker_demo_join()}
              >
                {m.match_maker_demo_badge()}
              </span>
            ) : (
              // Creating a room doesn't book a court — say so up front.
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-micro font-semibold",
                  room.bookingId
                    ? "bg-brand/10 text-brand"
                    : "bg-amber-500/12 text-amber-700 dark:text-amber-400"
                )}
              >
                {room.bookingId
                  ? m.match_maker_court_booked()
                  : m.match_maker_court_not_booked()}
              </span>
            )}
          </div>
          {/* Stretched over the whole card: clicking anywhere opens the
              room's details; the footer buttons sit above it (z-10). */}
          <button
            type="button"
            className="mt-1 block max-w-full truncate text-left font-heading text-lg leading-tight font-semibold after:absolute after:inset-0 after:rounded-panel focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
            title={m.match_maker_view_details()}
            onClick={onOpen}
          >
            {title}
          </button>
        </div>
        <LevelChip level={room.level} className="shrink-0" />
      </div>

      <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
          <Clock className="size-3.5 shrink-0 text-brand" />
          <span className="min-w-0 truncate">
            {day} · {room.time}
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          <MapPin className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">
            {room.venue ? (
              <>
                {room.venue} · {address} ·{" "}
                <CourtDistance courtId={room.courtId} venue={room.venue} />
              </>
            ) : (
              m.match_maker_dialog_no_court()
            )}
          </span>
        </span>
      </div>

      {/* Fill meter */}
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-secondary p-2.5">
        <div className="flex items-center gap-2">
          <AvatarGroup>
            {room.players.map((p, i) => (
              <Avatar key={i} className="size-7">
                <AvatarFallback tone="secondary" size="micro" weight="medium">
                  {p}
                </AvatarFallback>
              </Avatar>
            ))}
            {Array.from({ length: openSeats }).map((_, i) => (
              <span
                key={`seat-${i}`}
                className="grid size-7 place-items-center rounded-full border border-dashed border-border bg-background text-muted-foreground ring-2 ring-background"
              >
                <Users className="size-3" />
              </span>
            ))}
          </AvatarGroup>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {room.joined}/{room.capacity}
          </span>
        </div>
        {room.pricePerHour ? (
          <span className="text-sm font-semibold tabular-nums">
            {formatVnd(room.pricePerHour)}
            <span className="text-xs font-normal text-muted-foreground">
              /h
            </span>
          </span>
        ) : null}
      </div>

      <div className="mt-auto flex items-center gap-2 pt-1">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {hostOnline ? (
            <span
              role="img"
              aria-label={m.presence_online()}
              title={m.presence_online()}
              className="mr-1.5 inline-block size-2 rounded-full bg-brand align-middle"
            />
          ) : null}
          {m.match_maker_hosted_by({
            name: hosted ? sUser.name || userName : room.host.name,
          })}
          {!hosted && !joined && !requested && !full
            ? ` · ${m.match_maker_open_seats({ count: openSeats })}`
            : ""}
        </span>
        {hosted ? (
          <Button
            shape="pill"
            size="sm"
            variant="outline"
            className="relative z-10 ml-auto shrink-0 font-semibold"
            onPress={onOpen}
          >
            <Eye />
            {m.match_maker_view_room()}
          </Button>
        ) : requested ? (
          <Button
            size="sm"
            variant="ghost"
            onPress={onLeave}
            onMouseEnter={() => setLeaveHint(true)}
            onMouseLeave={() => setLeaveHint(false)}
            onFocus={() => setLeaveHint(true)}
            onBlur={() => setLeaveHint(false)}
            className={cn(
              "relative z-10 ml-auto shrink-0 rounded-full",
              leaveHint
                ? "bg-destructive/10 text-destructive hover:bg-destructive/15"
                : "bg-amber-500/12 text-amber-700 hover:bg-amber-500/15"
            )}
          >
            {leaveHint ? (
              <>
                <X />
                {m.match_maker_cancel_request()}
              </>
            ) : (
              <>
                <Hourglass />
                {m.match_maker_requested()}
              </>
            )}
          </Button>
        ) : joined ? (
          <Button
            size="sm"
            variant="ghost"
            onPress={onLeave}
            onMouseEnter={() => setLeaveHint(true)}
            onMouseLeave={() => setLeaveHint(false)}
            onFocus={() => setLeaveHint(true)}
            onBlur={() => setLeaveHint(false)}
            className={cn(
              "relative z-10 ml-auto shrink-0 rounded-full",
              leaveHint
                ? "bg-destructive/10 text-destructive hover:bg-destructive/15"
                : "bg-brand/10 text-brand hover:bg-brand/15"
            )}
          >
            {leaveHint ? (
              <>
                <LogOut />
                {m.match_maker_leave()}
              </>
            ) : (
              <>
                <Check />
                {m.match_maker_joined()}
              </>
            )}
          </Button>
        ) : (
          <Button
            shape="pill"
            size="sm"
            className="relative z-10 ml-auto shrink-0 font-semibold"
            variant={full || conflict || room.demo ? "outline" : "default"}
            isDisabled={full || conflict || room.demo}
            onPress={onJoin}
          >
            {room.demo
              ? m.match_maker_demo_badge()
              : full
                ? m.match_maker_full()
                : conflict
                  ? m.match_maker_time_clash()
                  : m.match_maker_join()}
          </Button>
        )}
      </div>
    </div>
  )
}
