import { useMemo, useState } from "react"
import type { ReactNode } from "react"
import {
  ArrowRight,
  Clock3,
  MapPin,
  MessageSquare,
  Search,
  Star,
  Users,
  Zap,
} from "lucide-react"
import { AdvancedImage } from "@cloudinary/react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"

import { Skeleton } from "@/components/ui/skeleton"
import { UserAvatar } from "@/features/chat/components/user-avatar"
import { chatQueries } from "@/features/chat/lib/chat-queries"
import {
  channelAvatarUser,
  channelTitle,
  previewText,
} from "@/features/chat/lib/chat-utils"
import { useAuthUser } from "@/features/dashboard/hooks/use-auth-user"
import { relativeTime } from "@/lib/relative-time"
import { cn } from "@/lib/utils"
import { useData } from "@/features/dashboard/components/data-provider"
import { useUserLocationContext } from "@/features/dashboard/state/location"
import { CLOUDINARY_IMAGES, cloudinaryImage } from "@/lib/cloudinary"
import { CourtMap } from "@/features/play/components/court-map"
import { useSessionData } from "@/features/play/hooks/use-session-data"
import { formatVnd } from "@/lib/shared"
import { hasCoordinates } from "@/lib/shared/location"
import { m } from "@/paraglide/messages"

const art = {
  courtLines: cloudinaryImage(CLOUDINARY_IMAGES.courtLines),
  right: cloudinaryImage(CLOUDINARY_IMAGES.badgeJoinMatch),
  left: cloudinaryImage(CLOUDINARY_IMAGES.badgeRightPeople),
  tag: cloudinaryImage(CLOUDINARY_IMAGES.badgeRightCourt),
  hand: cloudinaryImage(CLOUDINARY_IMAGES.stickerPeaceHand),
  star: cloudinaryImage(CLOUDINARY_IMAGES.stickerPinkAsterisk),
}

const players = [
  CLOUDINARY_IMAGES.playerPurpleHair,
  CLOUDINARY_IMAGES.playerGreenBuns,
  CLOUDINARY_IMAGES.playerBlueAfro,
  CLOUDINARY_IMAGES.playerBlueBuns,
  CLOUDINARY_IMAGES.playerPinkHair,
]

export function DashboardWelcome({
  composer,
  onPrompt,
  onBook,
  onResume,
}: {
  composer: ReactNode
  onPrompt: (text: string) => void
  onBook: (courtId: string) => void
  /** Set when an AI conversation is in progress — shows "Continue chatting". */
  onResume?: () => void
}) {
  const { courts, venuePins } = useData()
  const { userLoc } = useUserLocationContext()
  const { bookings } = useSessionData()
  const [mapSelectedId, setMapSelectedId] = useState<string | null>(null)

  // Stable references so the memoized CourtMap skips re-renders.
  const mapCourts = useMemo(() => courts.filter(hasCoordinates), [courts])
  const mapVenues = useMemo(() => venuePins.filter(hasCoordinates), [venuePins])
  const upcoming = bookings
    .filter(
      (booking) =>
        booking.status === "confirmed" || booking.status === "pending"
    )
    .sort((a, b) => (a.dayKey ?? "").localeCompare(b.dayKey ?? ""))
    .slice(0, 4)

  const actions = [
    {
      key: "badmintonNearMe",
      icon: MapPin,
      prompt: m.ai_dashboard_prompts_badminton_near_me(),
      label: m.ai_dashboard_prompts_short_badminton_near_me(),
    },
    {
      key: "bookTomorrow",
      icon: Clock3,
      prompt: m.ai_dashboard_prompts_book_tomorrow(),
      label: m.ai_dashboard_prompts_short_book_tomorrow(),
    },
    {
      key: "sameLevelPlayers",
      icon: Users,
      prompt: m.ai_dashboard_prompts_same_level_players(),
      label: m.ai_dashboard_prompts_short_same_level_players(),
    },
    {
      key: "quickMatch",
      icon: Zap,
      prompt: m.ai_dashboard_prompts_quick_match(),
      label: m.ai_dashboard_prompts_short_quick_match(),
    },
  ] as const

  return (
    <div className="min-h-full bg-white text-ink-strong">
      <section className="relative isolate overflow-hidden bg-black pb-9 text-white sm:pb-11">
        <AdvancedImage
          cldImg={art.courtLines}
          alt=""
          aria-hidden
          className="absolute top-0 left-1/2 h-pct-90 w-150 max-w-none -translate-x-1/2 object-fill opacity-85 sm:inset-0 sm:left-0 sm:h-full sm:w-full sm:translate-x-0"
        />
        <div className="relative mx-auto flex max-w-6xl flex-col items-center px-5 pt-12 sm:pt-20">
          <AdvancedImage
            cldImg={art.left}
            alt=""
            width={240}
            height={90}
            className="absolute top-4 left-1 w-36 sm:top-12 -rotate-6 sm:left-5 sm:w-48"
          />
          <AdvancedImage
            cldImg={art.tag}
            alt=""
            width={190}
            height={82}
            className="absolute top-40 right-0 w-28 rotate-6 sm:top-44 sm:right-4 sm:w-40"
          />
          <AdvancedImage
            cldImg={art.hand}
            alt=""
            width={95}
            height={105}
            className="absolute top-3 right-pct-20 hidden w-16 rotate-12 sm:block"
          />
          <AdvancedImage
            cldImg={art.star}
            alt=""
            width={75}
            height={75}
            className="absolute top-44 left-pct-8 hidden w-12 sm:block"
          />
          <AdvancedImage
            cldImg={art.right}
            alt=""
            width={210}
            height={205}
            className="absolute top-80 -right-2 z-10 w-20 sm:top-hero-offset-sm sm:w-40"
          />
          <div className="z-10 mt-7 w-full max-w-stage rounded-full bg-volt p-1.5 text-electric-mid shadow-pink-hard-lg sm:mt-10">
            <div className="flex items-center gap-3 pl-3 sm:pl-7">
              <div className="min-w-0 flex-1 [&_[data-flip-id]]:!bg-transparent [&_[data-flip-id]]:!p-0 [&_[data-flip-id]]:!shadow-none [&_[data-flip-id]]:!ring-0 [&_button]:!bg-electric-mid [&_button_svg]:!text-white [&_kbd]:hidden [&_svg]:!text-electric-mid [&_textarea]:!text-electric-mid [&_textarea]:placeholder:!text-electric-mid">
                {composer}
              </div>
              <Search
                className="mr-3 hidden size-7 shrink-0 sm:block"
                aria-hidden
              />
            </div>
          </div>
          {onResume ? (
            <button
              type="button"
              onClick={onResume}
              className="relative z-10 mt-5 inline-flex cursor-pointer items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-xs font-bold text-electric-deep shadow-pink-hard transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt"
            >
              <MessageSquare className="size-4" />
              {m.ai_dashboard_resume_chat()}
              <ArrowRight className="size-4" />
            </button>
          ) : null}
          <div className="relative z-10 mt-10 flex h-32 w-full max-w-2xl items-end justify-center gap-3 sm:h-44 sm:gap-7">
            {players.map((publicId, i) => (
              <AdvancedImage
                key={publicId}
                cldImg={cloudinaryImage(publicId)}
                alt=""
                width={145}
                height={175}
                className={`h-auto w-pct-18 max-w-28 object-contain ${i % 2 ? "-rotate-6" : "rotate-3"}`}
              />
            ))}
          </div>
          <h2 className="relative z-10 mt-14 text-xl font-black tracking-wide sm:mt-16">
            {m.ai_dashboard_quick_actions_label()}
          </h2>
          <div className="relative z-10 mt-4 grid w-full max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
            {actions.map(({ key, icon: Icon, prompt, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => onPrompt(prompt)}
                className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full bg-electric px-3 text-xs font-semibold text-white transition-transform hover:-translate-y-1 sm:text-sm"
              >
                <Icon className="size-5 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="relative mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <AdvancedImage
          cldImg={art.star}
          alt=""
          width={70}
          height={70}
          className="absolute top-28 left-0 hidden w-14 -rotate-12 lg:block"
        />
        <AdvancedImage
          cldImg={art.star}
          alt=""
          width={70}
          height={70}
          className="absolute right-0 bottom-8 hidden w-14 rotate-12 lg:block"
        />
        <h2 className="text-center text-2xl font-black tracking-wide">
          {m.ai_dashboard_recent_chats()}
        </h2>
        <div className="mx-auto mt-8 max-w-180">
          <RecentChatsList />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="rounded-hero border-2 border-electric px-5 py-8 sm:px-10">
          <div className="flex items-center justify-between gap-4 border-b-2 border-electric pb-5">
            <h2 className="text-xl font-black sm:text-2xl">
              {m.ai_dashboard_upcoming_bookings()}
            </h2>
            <Link
              to="/app/bookings"
              className="shrink-0 text-xs font-bold hover:underline"
            >
              {m.ai_dashboard_view_all()} →
            </Link>
          </div>
          {upcoming.length ? (
            <div className="grid gap-6 py-8 md:grid-cols-2">
              {upcoming.map((booking) => {
                const date = new Date(`${booking.dayKey}T00:00:00`)
                return (
                  <Link
                    key={booking.id}
                    to="/app/bookings"
                    className="flex items-center gap-4 rounded-xl p-2 transition-colors hover:bg-black/5"
                  >
                    <span className="flex size-20 shrink-0 flex-col items-center justify-center rounded-lg bg-electric text-white">
                      <span className="text-xs">
                        {new Intl.DateTimeFormat("vi-VN", {
                          month: "short",
                        }).format(date)}
                      </span>
                      <strong className="text-3xl text-volt">
                        {date.getDate()}
                      </strong>
                    </span>
                    <span className="min-w-0">
                      <strong className="block truncate text-base">
                        {booking.time}
                      </strong>
                      <span className="block truncate text-sm">
                        {booking.venue}
                      </span>
                      <span className="mt-1 block text-xs text-volt-ink">
                        {m.ai_dashboard_players_count({
                          count: String(booking.withPlayers.length + 1),
                        })}
                      </span>
                    </span>
                    <span className="ml-auto hidden shrink-0 rounded-full bg-volt px-2 py-1 text-micro font-bold text-electric-deep sm:block">
                      {booking.status === "confirmed"
                        ? m.ai_dashboard_status_confirmed()
                        : m.ai_dashboard_status_pending()}
                    </span>
                  </Link>
                )
              })}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-ink-soft">
              Chưa có lịch đặt sắp tới. Chọn một sân để bắt đầu chơi!
            </p>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20">
        <h2 className="mb-8 text-center text-2xl font-black">
          Các sân gần bạn
        </h2>
        <div className="relative h-72 overflow-hidden rounded-panel-lg bg-surface-dark text-white sm:h-96">
          <CourtMap
            courts={mapCourts}
            venues={mapVenues}
            selectedId={mapSelectedId}
            onSelect={setMapSelectedId}
            userLoc={userLoc}
          />
          <Link
            to="/app/play"
            className="absolute right-4 bottom-4 z-10 rounded-full bg-volt px-4 py-2 text-xs font-bold text-electric-deep"
          >
            Xem bản đồ →
          </Link>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {courts.slice(0, 4).map((court) => (
            <article
              key={court.id}
              className="overflow-hidden rounded-panel border border-white/15 bg-electric text-white"
            >
              <AdvancedImage
                cldImg={cloudinaryImage(CLOUDINARY_IMAGES.courtBackdrop)}
                alt=""
                className="h-36 w-full object-cover opacity-90"
              />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-1 font-bold">{court.name}</h3>
                  <span className="flex items-center gap-1 text-xs">
                    <Star className="size-3 fill-volt text-volt" />
                    {court.rating}
                  </span>
                </div>
                <p className="mt-2 flex items-center gap-1 text-xs text-white/80">
                  <MapPin className="size-3" />
                  {court.ward} · {court.distanceKm?.toFixed(1) ?? "—"} km
                </p>
                <div className="mt-5 flex items-center justify-between gap-2">
                  <strong>
                    {formatVnd(court.pricePerHour)}
                    <span className="text-xs font-normal">/giờ</span>
                  </strong>
                  <button
                    type="button"
                    onClick={() => onBook(court.id)}
                    className="cursor-pointer rounded-full bg-volt px-3 py-2 text-xs font-bold text-electric-deep hover:bg-white"
                  >
                    Đặt sân ngay
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link
            to="/app/play"
            className="inline-flex rounded-full bg-volt px-7 py-3 text-sm font-bold text-electric-deep"
          >
            Xem thêm
          </Link>
        </div>
      </section>
    </div>
  )
}

function RecentChatsList() {
  const { id: userId } = useAuthUser()
  const { data: channels, isError } = useQuery(chatQueries.channels())
  const recent = channels?.slice(0, 3) ?? []

  return (
    <div className="flex flex-col items-center gap-4 rounded-panel border-2 border-dashed border-volt px-6 py-8 text-center">
      {isError ? (
        <p className="max-w-md text-sm text-ink-soft">
          {m.ai_dashboard_recent_unavailable()}
        </p>
      ) : !channels ? (
        <Skeleton className="h-14 w-full max-w-md" />
      ) : recent.length === 0 ? (
        <p className="max-w-md text-sm text-ink-soft">
          {m.ai_dashboard_recent_empty()}
        </p>
      ) : (
        <ul className="flex w-full max-w-md flex-col gap-1 text-left">
          {recent.map((c) => {
            const title = channelTitle(c, userId)
            const avatarUser = channelAvatarUser(c, userId)
            return (
              <li key={c.id}>
                <Link
                  to="/app/chat"
                  search={{ channel: c.id }}
                  className="flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-black/5"
                >
                  <UserAvatar
                    name={avatarUser?.name ?? title}
                    image={avatarUser?.image}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-baseline justify-between gap-2">
                      <span
                        className={cn(
                          "truncate text-sm",
                          c.unread > 0 ? "font-bold" : "font-medium"
                        )}
                      >
                        {title}
                      </span>
                      <span className="shrink-0 text-mini text-ink-soft">
                        {c.lastMessage
                          ? relativeTime(new Date(c.lastMessage.createdAt))
                          : ""}
                      </span>
                    </span>
                    <span className="truncate text-xs text-ink-soft">
                      {c.lastMessage
                        ? previewText(c, userId)
                        : m.ai_dashboard_recent_no_messages()}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      <Link
        to="/app/chat"
        className="inline-flex items-center gap-2 rounded-full bg-electric px-5 py-2.5 text-xs font-bold text-white transition-colors hover:bg-electric-deep"
      >
        {m.ai_dashboard_open_chat()}
        <ArrowRight className="size-4" />
      </Link>
    </div>
  )
}
