import * as React from "react"
import {
  BadgeDollarSign,
  CalendarCheck,
  Hourglass,
  LocateFixed,
  MapPin,
  Navigation,
  ShieldCheck,
  Trophy,
  UserCheck,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  attendanceClosesAt,
  checkInWindow,
  formatVnd,
  SELF_CHECKIN_RADIUS_M,
} from "@/lib/shared"
import type { AttendanceMark, MatchRoom } from "@/lib/shared"
import {
  useCheckInRoom,
  useConfirmSelfCourt,
} from "@/features/play/api/session.queries"
import { currentPosition } from "@/features/play/lib/geolocation"
import type { GeoFailure } from "@/features/play/lib/geolocation"
import { useClock } from "@/features/play/hooks/use-clock"
import { m } from "@/paraglide/messages"

/** The room's court was booked outside the app (`courtMode: "self"`). */
export function isSelfRoom(room: Pick<MatchRoom, "courtMode">): boolean {
  return room.courtMode === "self"
}

/** A court is secured: booked through the app, or confirmed by a self-booking host. */
export function roomHasCourt(room: MatchRoom): boolean {
  return isSelfRoom(room)
    ? Boolean(room.selfCourt?.confirmed)
    : Boolean(room.bookingId)
}

const timeFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
})
const dayTimeFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
})

const geoMessages: Record<GeoFailure, () => string> = {
  denied: m.self_court_geo_denied,
  unavailable: m.self_court_geo_unavailable,
  unsupported: m.self_court_geo_unsupported,
}

/** The shape the shared time helpers read, built from a MatchRoom. */
function roomTiming(room: MatchRoom) {
  return {
    dayKey: room.dayKey ?? "",
    slot: room.time ? room.time.split(" – ")[0] : null,
    durationMin: room.durationMin ?? 60,
  }
}

/** Card chip for a self-booked room: who booked the court, and whether it's locked in. */
export function SelfCourtCardBadge({ room }: { room: MatchRoom }) {
  const confirmed = Boolean(room.selfCourt?.confirmed)
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-micro font-semibold",
        confirmed
          ? "bg-brand/10 text-brand"
          : "bg-amber-500/12 text-amber-700 dark:text-amber-400"
      )}
    >
      {m.self_court_badge()} ·{" "}
      {confirmed
        ? m.self_court_badge_confirmed()
        : m.self_court_badge_unconfirmed()}
    </span>
  )
}

/** The cost line under a self-booked room's card. */
export function selfCourtCostLabel(room: MatchRoom): string | null {
  const cost = room.selfCourt?.costPerPerson
  return cost ? m.self_court_cost_each({ amount: formatVnd(cost) }) : null
}

/**
 * The location + court-status block of a self-booked room's detail sheet.
 * Members see the exact address (with directions) and, around match time,
 * the check-in button; the host confirms the court here.
 */
export function SelfCourtSection({
  room,
  isHost,
  isMember,
  hostUserId,
  viewerId,
}: {
  room: MatchRoom
  isHost: boolean
  isMember: boolean
  hostUserId: string | undefined
  viewerId: string
}) {
  const court = room.selfCourt
  const confirm = useConfirmSelfCourt()
  const ranked = room.ranked !== false
  const hasPin = typeof court?.lat === "number" && typeof court.lng === "number"
  const mapsHref = hasPin
    ? `https://www.google.com/maps/search/?api=1&query=${court.lat},${court.lng}`
    : null

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-2 text-sm">
        <Row icon={MapPin}>
          <span className="font-medium">{court?.name ?? room.venue}</span>
          {room.ward ? ` · ${room.ward}` : null}
          {court?.courtNote ? (
            <span className="text-muted-foreground"> · {court.courtNote}</span>
          ) : null}
          {court?.address ? (
            <span className="block text-muted-foreground">{court.address}</span>
          ) : !isMember ? (
            <span className="block text-xs text-muted-foreground">
              {m.self_court_address_hidden()}
            </span>
          ) : null}
        </Row>
        {court?.costPerPerson ? (
          <Row icon={BadgeDollarSign}>
            {m.self_court_cost_each({ amount: formatVnd(court.costPerPerson) })}
          </Row>
        ) : null}
        <Row icon={Trophy}>
          {ranked ? m.self_court_ranked_on() : m.self_court_ranked_off()}
          <span className="block text-xs text-muted-foreground">
            {ranked ? m.self_court_rating_rule() : m.self_court_unranked_note()}
          </span>
        </Row>
      </div>

      {mapsHref && isMember ? (
        <a
          href={mapsHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-brand hover:underline"
        >
          <Navigation className="size-3.5" />
          {m.self_court_open_maps()}
        </a>
      ) : null}

      {court?.confirmed ? (
        <div className="flex items-center gap-1.5 rounded-2xl bg-brand/10 px-3 py-2 text-sm text-brand">
          <CalendarCheck className="size-4" />
          {m.self_court_badge_confirmed()}
        </div>
      ) : isHost ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-amber-500/10 p-3">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {m.self_court_confirm_body()}
          </p>
          <Button
            shape="pill"
            size="sm"
            isDisabled={confirm.isPending}
            onPress={() =>
              confirm.mutate(room.id, {
                onSuccess: () => toast.success(m.self_court_confirmed_toast()),
                onError: (error) => toast.error(error.message),
              })
            }
          >
            <CalendarCheck />
            {m.self_court_confirm_button()}
          </Button>
        </div>
      ) : (
        <p className="flex items-start gap-1.5 rounded-2xl bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <Hourglass className="mt-0.5 size-3.5 shrink-0" />
          {m.self_court_waiting_host()}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        {m.self_court_money_note()}
      </p>

      {isMember ? (
        <AttendanceBlock
          room={room}
          hostUserId={hostUserId}
          viewerId={viewerId}
        />
      ) : null}
    </div>
  )
}

/** Who has checked in so far, and the viewer's own check-in button. */
function AttendanceBlock({
  room,
  hostUserId,
  viewerId,
}: {
  room: MatchRoom
  hostUserId: string | undefined
  viewerId: string
}) {
  const now = useClock()
  const checkIn = useCheckInRoom()
  const [locating, setLocating] = React.useState(false)
  const timing = roomTiming(room)
  const slot = checkInWindow(timing)
  const closes = attendanceClosesAt(timing)
  const marks: Partial<Record<string, AttendanceMark>> = room.attendance ?? {}
  const mine = marks[viewerId]

  const members = (room.members ?? []).map((member) => ({
    ...member,
    id: member.userId ?? (member.host ? hostUserId : undefined),
  }))

  const doCheckIn = () => {
    setLocating(true)
    currentPosition()
      .then((fix) =>
        checkIn.mutateAsync({ roomId: room.id, position: fix }).then(() => {
          toast.success(m.self_court_checkin_success())
        })
      )
      .catch((err: unknown) => {
        if (typeof err === "string" && err in geoMessages) {
          toast.error(geoMessages[err as GeoFailure]())
        } else {
          toast.error(err instanceof Error ? err.message : String(err))
        }
      })
      .finally(() => setLocating(false))
  }

  let action: React.ReactNode = null
  if (mine) {
    action = (
      <p className="inline-flex items-center gap-1.5 text-sm font-medium text-brand">
        <ShieldCheck className="size-4" />
        {m.self_court_checkin_done()}
      </p>
    )
  } else if (slot && now !== null) {
    if (now < slot.opensAt) {
      action = (
        <p className="text-xs text-muted-foreground">
          {m.self_court_checkin_opens({
            time: timeFmt.format(new Date(slot.opensAt)),
            radius: SELF_CHECKIN_RADIUS_M,
          })}
        </p>
      )
    } else if (now <= slot.closesAt) {
      action = (
        <Button
          shape="pill"
          className="w-full font-semibold"
          isDisabled={locating || checkIn.isPending}
          onPress={doCheckIn}
        >
          <LocateFixed />
          {locating || checkIn.isPending
            ? m.self_court_checkin_locating()
            : m.self_court_checkin()}
        </Button>
      )
    } else if (closes !== null) {
      action = (
        <p className="text-xs text-muted-foreground">
          {m.self_court_checkin_closed({
            time: dayTimeFmt.format(new Date(closes)),
          })}
        </p>
      )
    }
  }

  return (
    <div className="mt-1 flex flex-col gap-2 rounded-2xl bg-secondary p-3">
      <span className="font-mono text-mini tracking-wider text-muted-foreground uppercase">
        {m.self_court_attendance()}
      </span>
      <ul className="flex flex-col gap-1.5">
        {members.map((member, i) => {
          const mark = member.id ? marks[member.id] : undefined
          return (
            <li
              key={`${member.initials}-${i}`}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="truncate">{member.name}</span>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 text-xs",
                  mark ? "text-brand" : "text-muted-foreground"
                )}
              >
                {mark ? <UserCheck className="size-3.5" /> : null}
                {mark
                  ? mark.via === "gps"
                    ? m.self_court_attended_gps()
                    : m.self_court_attended_vouch()
                  : m.self_court_not_attended()}
              </span>
            </li>
          )
        })}
      </ul>
      {action}
    </div>
  )
}

function Row({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
