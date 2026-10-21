import type { ComponentType } from "react"
import {
  CalendarCheck,
  CalendarPlus,
  LayoutDashboard,
  MessageSquare,
  Sparkles,
} from "lucide-react"

import { m } from "@/paraglide/messages"

export type SectionKey = "dashboard" | "play" | "chat" | "bookings" | "book"

export interface NavItem<TKey extends string = string> {
  key: TKey
  /** Route path for this section. */
  href: string
  label: () => string
  icon: ComponentType<{ className?: string }>
  /** Short description shown under the page title in the top bar. */
  caption: () => string
  /**
   * Resolved by {@link activeNavItem} (so the topbar gets a title) but kept out
   * of the sidebar — used for transient flows like the booking wizard that have
   * a route but no permanent menu slot.
   */
  hidden?: boolean
  /** Sidebar sub-group heading; items without one sit in the first, unlabeled group. */
  group?: () => string
}

export const NAV: NavItem<SectionKey>[] = [
  {
    key: "dashboard",
    href: "/app",
    label: m.nav_dashboard_label,
    icon: LayoutDashboard,
    caption: m.nav_dashboard_caption,
  },
  {
    key: "play",
    href: "/app/play",
    label: m.nav_play_label,
    icon: Sparkles,
    caption: m.nav_play_caption,
  },
  {
    key: "chat",
    href: "/app/chat",
    label: m.nav_chat_label,
    icon: MessageSquare,
    caption: m.nav_chat_caption,
  },
  {
    key: "bookings",
    href: "/app/bookings",
    label: m.nav_bookings_label,
    icon: CalendarCheck,
    caption: m.nav_bookings_caption,
  },
  {
    key: "book",
    href: "/app/book",
    label: m.nav_book_label,
    icon: CalendarPlus,
    caption: m.nav_book_caption,
    hidden: true,
  },
]

export function isNavActive(href: string, pathname: string): boolean {
  if (href === "/app") return pathname === "/app"
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** The nav item matching the current pathname (falls back to the overview). */
export function activeNavItem(pathname: string): NavItem<SectionKey> {
  return NAV.find((item) => isNavActive(item.href, pathname)) ?? NAV[0]
}
