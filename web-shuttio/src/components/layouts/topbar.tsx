import { Link, useLocation } from "@tanstack/react-router"
import {
  CalendarCheck,
  LayoutDashboard,
  MessageSquare,
  Sparkles,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Logo } from "@/components/logo"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ActiveRoomPill } from "@/features/play/components/active-room"
import { NotificationsButton } from "@/features/dashboard/components/notifications"
import { AccountMenu } from "@/features/dashboard/components/account-menu"
import { SectionActions } from "@/features/dashboard/components/section-actions"
import { navContext } from "@/features/dashboard/lib/workspace"
import { m } from "@/paraglide/messages"

/** Primary links in the shared blue player header. */
const PLAYER_HEADER_NAV = [
  {
    key: "dashboard",
    href: "/app",
    icon: LayoutDashboard,
    label: m.nav_dashboard_label,
  },
  { key: "play", href: "/app/play", icon: Sparkles, label: m.nav_play_label },
  {
    key: "chat",
    href: "/app/chat",
    icon: MessageSquare,
    label: m.nav_chat_label,
  },
  {
    key: "bookings",
    href: "/app/bookings",
    icon: CalendarCheck,
    label: m.nav_bookings_label,
  },
] as const

/** Fixed bottom tab bar shown only on mobile for the player surface. */
function MobilePlayerNav({ activeKey }: { activeKey: string | undefined }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-white/10 bg-electric md:hidden">
      {PLAYER_HEADER_NAV.map((item) => {
        const Icon = item.icon
        const isActive = item.key === activeKey
        return (
          <Link
            key={item.key}
            to={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-micro transition-colors",
              isActive
                ? "font-bold text-volt"
                : "text-white/70 hover:text-white"
            )}
          >
            <Icon
              className={cn("size-5", isActive ? "text-volt" : "text-white/70")}
              aria-hidden
            />
            <span>{item.label()}</span>
          </Link>
        )
      })}
    </nav>
  )
}

/** Header icon buttons — same 44px circle as the avatar so the three line up. */
const HEADER_ICON_BUTTON =
  "size-11 rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white aria-expanded:bg-white/20 aria-expanded:text-white dark:hover:bg-white/20 [&_svg:not([class*='size-'])]:size-5 [&>span]:bg-volt [&>span]:text-electric-ink"

/** Sticky dashboard header — its title and actions track the active workspace. */
export function DashboardTopbar() {
  const pathname = useLocation({ select: (l) => l.pathname })
  const { active, workspace } = navContext(pathname)
  if (
    pathname === "/app" ||
    pathname === "/app/play" ||
    pathname === "/app/chat" ||
    pathname === "/app/bookings" ||
    pathname === "/app/book" ||
    pathname.startsWith("/app/payment/")
  ) {
    const activeKey =
      pathname === "/app/chat"
        ? "chat"
        : pathname === "/app/bookings"
          ? "bookings"
          : pathname === "/app/play"
            ? "play"
            : pathname === "/app"
              ? "dashboard"
              : undefined
    return (
      <header className="z-20 grid h-22 shrink-0 grid-cols-trio items-center bg-electric px-5 text-white md:px-10 xl:px-pct-7p5">
        <Link
          to="/app"
          className="shrink-0 justify-self-start"
          aria-label="Shuttio home"
        >
          <Logo className="text-white" markClassName="size-12 !text-volt" />
        </Link>
        <MobilePlayerNav activeKey={activeKey} />
        <nav className="hidden items-center gap-9 text-sm md:flex">
          {PLAYER_HEADER_NAV.map((item) => (
            <Link
              key={item.key}
              to={item.href}
              aria-current={item.key === activeKey ? "page" : undefined}
              className={cn(
                "transition-colors",
                item.key === activeKey
                  ? "font-bold text-volt"
                  : "hover:text-volt"
              )}
            >
              {item.label()}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 justify-self-end">
          <NotificationsButton
            className={HEADER_ICON_BUTTON}
            popupClassName="player-play-overlay"
          />
          <AccountMenu />
        </div>
      </header>
    )
  }

  return (
    <header className="flex h-20 shrink-0 items-center gap-2 px-3 pt-4 sm:px-4">
      <SidebarTrigger className="-ml-1" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-heading text-xl leading-tight font-semibold">
          {active.label()}
        </h1>
        <p className="truncate text-sm font-medium text-muted-foreground">
          {active.caption()}
        </p>
      </div>
      {workspace === "player" ? <ActiveRoomPill /> : null}
      <NotificationsButton />
      <SectionActions workspace={workspace} sectionKey={active.key} />
    </header>
  )
}
