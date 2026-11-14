import { useLocation, useRouter } from "@tanstack/react-router"
import { CourtDistance } from "@/features/dashboard/components/court-distance"

import * as React from "react"
import {
  BadgeDollarSign,
  Bell,
  CalendarCheck,
  CalendarPlus,
  Check,
  ChevronRight,
  Clock,
  Crown,
  Hourglass,
  LogOut,
  MapPin,
  MessageSquare,
  Minus,
  Plus,
  Star,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { roomChannelId } from "@/features/chat/lib/channel-ids"
import { remindSharePayment } from "@/features/play/api/rooms-api"
import { useMarkSharePaid } from "@/features/play/api/session.queries"
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  LevelChip,
  PlayerAvatar,
  SportDot,
  SportTag,
  dayWordLabel,
  formatLabel,
} from "@/features/dashboard/components/shared"
import {
  formatVnd,
  initialsOf,
  pendingRequests,
  trustTier,
  trustTierAccent,
} from "@/lib/shared"
import type { MatchRoom, RoomMember } from "@/lib/shared"
import { useData } from "@/features/dashboard/components/data-provider"
import { useBookingWizard } from "@/features/booking/hooks/use-booking-wizard"
import { useSessionData } from "@/features/play/hooks/use-session-data"
import { useSessionActions } from "@/features/play/hooks/use-session-actions"
import { useSessionUi } from "@/features/play/state/session-ui"
import { PlayerProfileDialog } from "@/features/dashboard/components/profile-dialog"
import { RoomSharePanel } from "@/features/play/components/room-share"
import { useAuthUser } from "@/features/dashboard/hooks/use-auth-user"
import { usePresence } from "@/features/presence/presence"
import { m } from "@/paraglide/messages"

const trustMessages = {
  trusted: m.active_room_trust_trusted,
  reliable: m.active_room_trust_reliable,
  new: m.active_room_trust_new,
} as const

const sportsMessages = {
  badminton: m.common_sports_badminton,
} as const

/**
 * Persistent topbar pill shown whenever the user is in at least one match room.
 * It opens a slide-over with the active room's location, participants (and their
 * trust scores), plus a switcher for any
 * other rooms the user has joined.
 */
export function ActiveRoomPill() {
  const { joinedRooms, activeRoom, sessions } = useSessionData()
  const { managerOpen, setManagerOpen } = useSessionUi()
  const { user: USER } = useData()
  const pathname = useLocation({ select: (l) => l.pathname })
  const playScope = pathname === "/app/play"

  if (!activeRoom) return null

  const extra = joinedRooms.length - 1
  const booked = Boolean(activeRoom.bookingId)
  // Join requests waiting on the user across every room they host.
  const pendingTotal = sessions.reduce(
    (n, s) =>
      n + (s.host.initials === USER.initials ? pendingRequests(s).length : 0),
    0
  )

  return (
    <>
      <Button
        variant="outline"
        onPress={() => setManagerOpen(true)}
        className={cn(
          "h-auto gap-2 rounded-full py-1.5 pr-3 pl-2.5 text-xs text-foreground focus-visible:ring-2",
          booked
            ? "border-brand/30 bg-brand/10 hover:bg-brand/15 focus-visible:ring-brand"
            : "border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15 focus-visible:ring-amber-500"
        )}
        aria-label={m.active_room_pill()}
      >
        <span className="relative flex size-2 shrink-0">
          <span
            className={cn(
              "absolute inline-flex size-full animate-ping rounded-full",
              booked ? "bg-brand/70" : "bg-amber-500/70"
            )}
          />
          <span
            className={cn(
              "relative inline-flex size-2 rounded-full",
              booked ? "bg-brand" : "bg-amber-500"
            )}
          />
        </span>
        <span className="hidden sm:inline">{m.active_room_pill()}</span>
        <span className="text-muted-foreground">
          {booked
            ? `· ${activeRoom.time.split(" – ")[0]}`
            : m.active_room_no_court_short()}
        </span>
        {extra > 0 ? (
          <span className="rounded-full bg-foreground/10 px-1.5 font-mono text-micro tabular-nums">
            {m.active_room_more({ count: extra })}
          </span>
        ) : null}
        {pendingTotal > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 font-mono text-micro text-amber-600 tabular-nums dark:text-amber-400">
            <Hourglass className="size-2.5" />
            {pendingTotal}
          </span>
        ) : null}
      </Button>

      <Sheet
        isOpen={managerOpen}
        onOpenChange={setManagerOpen}
        className={cn(
          "w-full gap-0 p-0 sm:max-w-sm",
          playScope && "player-play-overlay"
        )}
      >
        <RoomDetail room={activeRoom} onClose={() => setManagerOpen(false)} />
      </Sheet>
    </>
  )
}

/**
 * The same slide-over as the active-room pill, opened from a lobby card for
 * any room — so a player who hasn't joined yet can see the details and the
 * line-up (and each member's profile) before asking to join. The room is
 * looked up live, so the footer follows a request/approval as it happens.
 */
export function RoomPreviewSheet({
  roomId,
  open,
  onOpenChange,
}: {
  roomId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { rooms } = useSessionData()
  const pathname = useLocation({ select: (l) => l.pathname })
  const playScope = pathname === "/app/play"
  const room = rooms.find((r) => r.id === roomId)

  return (
    <Sheet
      isOpen={open && Boolean(room)}
      onOpenChange={onOpenChange}
      className={cn(
        "w-full gap-0 p-0 sm:max-w-sm",
        playScope && "player-play-overlay"
      )}
    >
      {room ? (
        <RoomDetail room={room} onClose={() => onOpenChange(false)} />
      ) : null}
    </Sheet>
  )
}

function RoomDetail({
  room,
  onClose,
}: {
  room: MatchRoom
  onClose: () => void
}) {
  const {
    joinedRooms,
    joinedIds,
    hasTimeConflict,
    userName,
    sessions,
    requestedIds,
  } = useSessionData()
  const { setActiveRoomId } = useSessionUi()
  const {
    joinRoom,
    leaveRoom,
    setRoomCapacity,
    invitePlayer,
    kickPlayer,
    approveRequest,
    declineRequest,
  } = useSessionActions()
  const sUser = useAuthUser()
  // Which of the other real players have the app open right now.
  const presence = usePresence(
    (room.members ?? []).flatMap((member) =>
      member.userId && member.userId !== sUser.id ? member.userId : []
    )
  )
  const { bookCourtForSession } = useBookingWizard()
  const { players: MATCH_SUGGESTIONS, user: USER, courtByVenue } = useData()
  const markPaid = useMarkSharePaid()
  const router = useRouter()
  const pathname = useLocation({ select: (l) => l.pathname })
  const playScope = pathname === "/app/play"

  // Only ever set for a room I host — someone else's room I'm awaiting
  // approval on isn't in my own `sessions` (Phase 9 G2: it lives on the
  // host's doc, discoverable only via `GET /api/rooms`).
  const session = sessions.find((s) => s.id === room.id)
  // Players awaiting this host's approval (host reviews their reliability).
  const requests = session ? pendingRequests(session) : []
  // Whether the user themselves is still waiting on this room's host —
  // derived from `requestedIds` (which covers both my own and cross-user
  // rooms), not from `session`, since a cross-user pending request never
  // lands in my own doc.
  const awaitingApproval = requestedIds.has(room.id)
  // A player browsing a room they're not in (opened from its lobby card)
  // sees the same details, read-only, with a join action instead.
  const isMember = joinedIds.has(room.id)
  const conflict = !isMember && !awaitingApproval && hasTimeConflict(room)
  const court = courtByVenue(room.venue)
  const address = court
    ? [court.ward, court.province].filter(Boolean).join(", ")
    : room.ward

  const title = room.title
  const others = joinedRooms.filter((r) => r.id !== room.id)
  const isHost = room.host.initials === USER.initials
  const full = room.joined >= room.capacity
  const booked = Boolean(room.bookingId)
  // People to invite: not already in the room (nor awaiting approval),
  // same-sport listed first.
  const requestedInitials = new Set(requests.map((p) => p.initials))
  const invitable = [...MATCH_SUGGESTIONS]
    .filter(
      (p) =>
        !room.players.includes(p.initials) && !requestedInitials.has(p.initials)
    )
    .sort((a, b) => b.matchPct - a.matchPct)

  const [profileInitials, setProfileInitials] = React.useState<string | null>(
    null
  )
  const [profileOpen, setProfileOpen] = React.useState(false)

  const openProfile = (initials: string) => {
    setProfileInitials(initials)
    setProfileOpen(true)
  }

  const openChat = () => {
    void router.navigate({
      to: "/app/chat",
      search: { channel: roomChannelId(room.id) },
    })
    onClose()
  }

  const leave = () => {
    leaveRoom(room.id)
    onClose()
  }

  // The host's destructive action cancels (disbands) the room and surfaces the
  // cancellation/refund policy; a member's is a plain "leave". A booked room's
  // policy mentions the refund tiers since real money was held.
  const destructiveLabel = isHost
    ? m.active_room_cancel_room()
    : m.active_room_leave()
  const destructiveTitle = isHost
    ? m.active_room_cancel_room_title()
    : m.active_room_leave_title()
  const destructiveConfirm = isHost
    ? m.active_room_cancel_room_confirm()
    : m.active_room_leave_confirm()
  const destructiveBody = isHost
    ? booked
      ? m.active_room_cancel_booked_body()
      : m.active_room_cancel_forming_body()
    : m.active_room_leave_body()

  return (
    <>
      <SheetHeader className="gap-2 border-b border-border pr-14">
        <div className="flex items-center gap-2">
          <SportTag sport={room.sport} />
          <span className="text-xs text-muted-foreground">
            · {formatLabel(room.format)}
          </span>
        </div>
        <SheetTitle className="text-lg leading-tight">{title}</SheetTitle>
        <SheetDescription>
          {m.match_maker_hosted_by({
            name: isHost ? sUser.name || userName : room.host.name,
          })}
        </SheetDescription>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
        {awaitingApproval ? (
          <div className="flex items-start gap-2.5 rounded-2xl bg-amber-500/10 px-3 py-2.5 text-amber-700 dark:text-amber-400">
            <Hourglass className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {m.active_room_awaiting_approval()}
              </p>
              <p className="mt-0.5 text-xs text-amber-700/80 dark:text-amber-400/80">
                {m.active_room_awaiting_approval_body({
                  name: isHost ? sUser.name || userName : room.host.name,
                })}
              </p>
            </div>
          </div>
        ) : null}

        <section className="flex flex-col gap-2.5">
          <SectionLabel>{m.active_room_location()}</SectionLabel>
          <div className="flex flex-col gap-2 text-sm">
            <DetailRow icon={MapPin}>
              {room.venue ? (
                <>
                  {room.venue} · {address} ·{" "}
                  <CourtDistance courtId={room.courtId} venue={room.venue} />
                  {/* Until booked, the court is only the host's proposal. */}
                  {booked ? null : ` ${m.match_maker_proposed_suffix()}`}
                </>
              ) : (
                m.match_maker_dialog_no_court()
              )}
            </DetailRow>
            <DetailRow icon={Clock}>
              {room.time
                ? `${dayWordLabel(room.day)} · ${room.time}`
                : m.active_room_no_court_yet()}
            </DetailRow>
            <DetailRow icon={Users}>
              {sportsMessages[room.sport]()} · {formatLabel(room.format)}
              {room.pricePerHour
                ? ` · ${formatVnd(room.pricePerHour)}/h`
                : null}
            </DetailRow>
          </div>

          {/* Court status — shown to ALL members */}
          {booked ? (
            <>
              <div className="flex items-center justify-between gap-2 rounded-2xl bg-brand/10 px-3 py-2 text-sm">
                <span className="inline-flex items-center gap-1.5 text-brand">
                  <CalendarCheck className="size-4" />
                  {m.active_room_booked({
                    day: dayWordLabel(room.day),
                    time: room.time,
                  })}
                </span>
                <Button
                  shape="pill"
                  variant="ghost"
                  size="xs"

                  onPress={() => {
                    void router.navigate({ href: "/app/bookings" })
                    onClose()
                  }}
                >
                  {m.active_room_view_in_bookings()}
                </Button>
              </div>
              <RoomSharePanel sharePrice={room.sharePrice} />
            </>
          ) : isHost ? (
            <Button
              shape="pill"
              variant="outline"
              size="sm"
              className="w-full"
              onPress={() => {
                bookCourtForSession(room.id)
                onClose()
              }}
            >
              <CalendarPlus />
              {m.active_room_book_court()}
            </Button>
          ) : (
            <p className="rounded-2xl bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              {m.active_room_host_no_court()}
            </p>
          )}
        </section>

        {/* Join requests — host reviews reliability before approving */}
        {isHost && requests.length ? (
          <section className="flex flex-col gap-3">
            <SectionLabel>
              {m.active_room_requests({ count: requests.length })}
            </SectionLabel>
            <div className="flex flex-col gap-2">
              {requests.map((p) => (
                <RequestRow
                  key={p.initials}
                  initials={p.initials}
                  requester={p}
                  full={full}
                  onApprove={() => approveRequest(room.id, p.initials)}
                  onDecline={() => declineRequest(room.id, p.initials)}
                  onViewProfile={openProfile}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="flex flex-col gap-3">
          <SectionLabel>
            {m.active_room_participants({ count: room.players.length })}
          </SectionLabel>
          <div className="flex flex-col gap-3">
            {room.players.map((initials, i) => {
              const member = room.members?.at(i)
              const memberId = member?.userId
              const isPaid = member?.paid ?? false
              const paidPending =
                markPaid.isPending &&
                markPaid.variables.memberUserId === memberId
              return (
                <ParticipantRow
                  key={`${initials}-${i}`}
                  sport={room.sport}
                  initials={initials}
                  member={member}
                  online={presence.get(memberId ?? "")?.online ?? false}
                  canKick={isHost && initials !== USER.initials}
                  onKick={() => kickPlayer(room.id, initials)}
                  onViewProfile={openProfile}
                  sharePrice={booked ? room.sharePrice : undefined}
                  paidPending={paidPending}
                  onRemind={
                    isHost && memberId && !isPaid
                      ? () => {
                          void remindSharePayment(room.id, memberId).then(
                            (res) => {
                              if (res.ok) {
                                toast.success(m.active_room_remind_sent())
                              } else {
                                toast.error(res.message)
                              }
                            }
                          )
                        }
                      : undefined
                  }
                  onMarkPaid={
                    isHost && memberId && !isPaid
                      ? () => {
                          markPaid.mutate(
                            { roomId: room.id, memberUserId: memberId },
                            {
                              onError: (error) => toast.error(error.message),
                            }
                          )
                        }
                      : undefined
                  }
                />
              )
            })}
          </div>
        </section>

        {isHost ? (
          <section className="flex flex-col gap-3">
            <SectionLabel>{m.active_room_host_controls()}</SectionLabel>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">{m.active_room_max_players()}</span>
              <div className="flex items-center gap-2">
                <Button
                  shape="pill"
                  variant="outline"
                  size="icon-sm"

                  isDisabled={room.capacity <= room.joined}
                  aria-label={m.active_room_max_players_dec()}
                  onPress={() => setRoomCapacity(room.id, room.capacity - 1)}
                >
                  <Minus />
                </Button>
                <span className="w-6 text-center font-mono text-sm tabular-nums">
                  {room.capacity}
                </span>
                <Button
                  shape="pill"
                  variant="outline"
                  size="icon-sm"

                  isDisabled={room.capacity >= 8}
                  aria-label={m.active_room_max_players_inc()}
                  onPress={() => setRoomCapacity(room.id, room.capacity + 1)}
                >
                  <Plus />
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-mini tracking-wider text-muted-foreground uppercase">
                {m.active_room_invite_players()}
              </span>
              {full ? (
                <p className="rounded-2xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  {m.active_room_room_full()}
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {invitable.map((p) => (
                    <div key={p.id} className="flex items-center gap-2.5 p-1">
                      <PlayerAvatar initials={p.initials} />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-sm">{p.name}</span>
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <LevelChip level={p.level} />
                          {sportsMessages[p.sport]()}
                        </span>
                      </div>
                      <Button
                        shape="pill"
                        size="xs"
                        variant="outline"
                        className="shrink-0"
                        onPress={() => invitePlayer(room.id, p.initials)}
                      >
                        <UserPlus />
                        {m.active_room_invite()}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {isMember && others.length ? (
          <section className="flex flex-col gap-2">
            <SectionLabel>{m.active_room_other_rooms()}</SectionLabel>
            <div className="flex flex-col gap-1">
              {others.map((r) => {
                const rTitle = r.title
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setActiveRoomId(r.id, r.title)}
                    className="flex w-full items-center gap-2.5 rounded-2xl p-2 text-left transition-colors hover:bg-muted/60"
                  >
                    <SportDot sport={r.sport} />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {rTitle}
                      {r.venue ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · {r.venue}
                        </span>
                      ) : null}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                )
              })}
            </div>
          </section>
        ) : null}
      </div>

      <SheetFooter className="flex-row gap-2 border-t border-border">
        {awaitingApproval ? (
          <Button
            shape="pill"
            variant="outline"
            className="flex-1"
            onPress={leave}
          >
            <X />
            {m.active_room_cancel_request()}
          </Button>
        ) : !isMember ? (
          <Button
            shape="pill"
            className="flex-1 font-semibold"
            isDisabled={full || conflict || room.demo}
            onPress={() => joinRoom(room)}
          >
            {room.demo ? (
              m.match_maker_demo_badge()
            ) : full ? (
              m.match_maker_full()
            ) : conflict ? (
              m.match_maker_time_clash()
            ) : (
              <>
                <UserPlus />
                {m.match_maker_join()}
              </>
            )}
          </Button>
        ) : (
          <>
            <Button
              shape="pill"
              variant="outline"
              className="flex-1"
              onPress={openChat}
            >
              <MessageSquare />
              {m.active_room_open_chat()}
            </Button>
            <AlertDialogTrigger>
              <Button shape="pill" variant="destructive" className="flex-1">
                {isHost ? <Trash2 /> : <LogOut />}
                {destructiveLabel}
              </Button>
              <AlertDialogContent
                className={cn(playScope && "player-play-overlay")}
              >
                <AlertDialogHeader>
                  <AlertDialogTitle>{destructiveTitle}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {destructiveBody}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>
                    {m.active_room_leave_cancel()}
                  </AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onPress={leave}>
                    {destructiveConfirm}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialogTrigger>
          </>
        )}
      </SheetFooter>

      <PlayerProfileDialog
        initials={profileInitials}
        open={profileOpen}
        onOpenChange={setProfileOpen}
        member={
          [...(room.members ?? []), ...requests].find(
            (p) => p.initials === profileInitials
          ) ?? null
        }
      />
    </>
  )
}

function ParticipantRow({
  sport,
  initials,
  member,
  online,
  canKick,
  onKick,
  onViewProfile,
  sharePrice,
  paidPending,
  onRemind,
  onMarkPaid,
}: {
  sport: MatchRoom["sport"]
  initials: string
  member?: RoomMember
  /** This player has the app open right now (never set for oneself). */
  online?: boolean
  canKick?: boolean
  onKick?: () => void
  onViewProfile?: (initials: string) => void
  /** Non-zero when the room is booked and cost-sharing is enabled. */
  sharePrice?: number
  /** Host-only: this member's paid write is in flight. */
  paidPending?: boolean
  /** Host-only: send a payment reminder to this member. */
  onRemind?: () => void
  /** Host-only: mark this member as having paid. */
  onMarkPaid?: () => void
}) {
  const { userLevelForSport, userName } = useSessionData()
  const sUser = useAuthUser()
  const { user: USER, players, playerByInitials } = useData()
  const { name, level, trust } = playerByInitials(initials)
  const tier = trustTier(trust)
  const isYou = member?.userId
    ? member.userId === sUser.id
    : initials === USER.initials
  // A real (non-seed) player has no seed level/trust — `playerByInitials`
  // would only invent defaults, so their level lives on their profile.
  const real =
    Boolean(member?.userId) && !players.some((p) => p.initials === initials)
  const displayName = isYou ? sUser.name || userName : member?.name || name
  const displayInitials = isYou ? initialsOf(sUser.name || userName) : initials

  const info = (
    <>
      <PlayerAvatar initials={displayInitials} online={online} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">
            {displayName}
            {isYou ? (
              <span className="text-muted-foreground">
                {" "}
                ({m.active_room_you()})
              </span>
            ) : null}
          </span>
          {isYou || !real ? (
            <LevelChip level={isYou ? userLevelForSport(sport) : level} />
          ) : null}
          {member?.host ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-mini font-medium text-brand">
              <Crown className="size-3" />
              {m.match_maker_members_host()}
            </span>
          ) : null}
        </div>
        {real && !isYou ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {m.match_maker_members_view_profile()}
          </p>
        ) : (
          <div
            className={cn(
              "mt-0.5 inline-flex items-center gap-1 text-xs",
              trustTierAccent[tier]
            )}
          >
            <Star className="size-3 fill-current" />
            <span className="font-mono tabular-nums">{trust}</span>
            <span className="text-muted-foreground">
              · {trustMessages[tier]()}
            </span>
          </div>
        )}
      </div>
    </>
  )

  const showShare = sharePrice && sharePrice > 0 && !member?.host
  const isPaid = member?.paid

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        {!isYou && onViewProfile ? (
          <button
            type="button"
            className="-m-1 flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left transition-colors hover:bg-muted/40"
            onClick={() => onViewProfile(initials)}
          >
            {info}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">{info}</div>
        )}
        {canKick && !showShare ? (
          <Button
            shape="pill"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground"
            aria-label={m.active_room_remove()}
            onPress={onKick}
          >
            <X />
          </Button>
        ) : null}
      </div>

      {showShare ? (
        <div className="ml-9 flex items-center gap-1.5">
          {isPaid ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-mini font-medium text-brand">
              <Check className="size-3" />
              {m.active_room_share_paid()}
            </span>
          ) : (
            <>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-mini font-medium text-amber-700 dark:text-amber-400">
                <BadgeDollarSign className="size-3" />
                {m.active_room_share_unpaid()}
              </span>
              {onRemind ? (
                <Button
                  shape="pill"
                  variant="ghost"
                  size="xs"
                  className="h-5 px-2 text-mini"
                  onPress={onRemind}
                >
                  <Bell className="size-3" />
                  {m.active_room_remind_pay()}
                </Button>
              ) : null}
              {onMarkPaid ? (
                <Button
                  shape="pill"
                  variant="ghost"
                  size="xs"
                  className="h-5 px-2 text-mini"
                  isDisabled={paidPending}
                  onPress={onMarkPaid}
                >
                  <Check className="size-3" />
                  {m.active_room_confirm_paid()}
                </Button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

/** A pending join request: the host reviews reliability, then approves/declines. */
function RequestRow({
  initials,
  requester,
  full,
  onApprove,
  onDecline,
  onViewProfile,
}: {
  initials: string
  /** The stored roster entry — carries a real requester's name and id. */
  requester?: { name: string; userId?: string }
  full: boolean
  onApprove: () => void
  onDecline: () => void
  onViewProfile?: (initials: string) => void
}) {
  const { players, playerByInitials } = useData()
  const seed = playerByInitials(initials)
  const { level, trust } = seed
  const tier = trustTier(trust)
  // Same rule as ParticipantRow: a real player has no seed level/trust.
  const real =
    Boolean(requester?.userId) && !players.some((p) => p.initials === initials)
  const name = requester?.name || seed.name

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl bg-muted/40 p-3">
      <button
        type="button"
        className="-m-1 flex items-center gap-3 rounded-xl p-1 text-left transition-colors hover:bg-muted/40"
        onClick={() => onViewProfile?.(initials)}
        disabled={!onViewProfile}
      >
        <PlayerAvatar initials={initials} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{name}</span>
            {real ? null : <LevelChip level={level} />}
          </div>
          {real ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {m.match_maker_members_view_profile()}
            </p>
          ) : (
            <div
              className={cn(
                "mt-0.5 inline-flex items-center gap-1 text-xs",
                trustTierAccent[tier]
              )}
            >
              <Star className="size-3 fill-current" />
              <span className="font-mono tabular-nums">{trust}</span>
              <span className="text-muted-foreground">
                · {m.active_room_reliability()} · {trustMessages[tier]()}
              </span>
            </div>
          )}
        </div>
      </button>
      <div className="flex items-center gap-2">
        <Button
          shape="pill"
          size="xs"
          className="flex-1"
          isDisabled={full}
          onPress={onApprove}
        >
          <Check />
          {m.active_room_approve()}
        </Button>
        <Button
          shape="pill"
          size="xs"
          variant="outline"
          className="flex-1"
          onPress={onDecline}
        >
          <X />
          {m.active_room_decline()}
        </Button>
      </div>
      {full ? (
        <p className="text-mini text-amber-700 dark:text-amber-400">
          {m.active_room_request_full()}
        </p>
      ) : null}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-mono text-mini tracking-wider text-muted-foreground uppercase">
      {children}
    </h3>
  )
}

function DetailRow({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0">{children}</span>
    </span>
  )
}
