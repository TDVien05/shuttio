import {
  BadgeCheck,
  Banknote,
  Building2,
  CalendarClock,
  LayoutDashboard,
  MessageSquareQuote,
  MessageSquareWarning,
  TicketPercent,
} from "lucide-react"

import type { NavItem } from "@/features/dashboard/nav"
import { m } from "@/paraglide/messages"

export type AdminSectionKey =
  | "overview"
  | "venues"
  | "bookings"
  | "discounts"
  | "refunds"
  | "complaints"
  | "approvals"
  | "reviews"

export const ADMIN_BASE_PREFIX = "/app/admin"

export const ADMIN_NAV: NavItem<AdminSectionKey>[] = [
  {
    key: "overview",
    href: ADMIN_BASE_PREFIX,
    label: m.admin_nav_overview_label,
    icon: LayoutDashboard,
    caption: m.admin_nav_overview_caption,
  },
  {
    key: "venues",
    href: `${ADMIN_BASE_PREFIX}/venues`,
    label: m.admin_nav_venues_label,
    icon: Building2,
    caption: m.admin_nav_venues_caption,
  },
  {
    key: "bookings",
    href: `${ADMIN_BASE_PREFIX}/bookings`,
    label: m.admin_nav_bookings_label,
    icon: CalendarClock,
    caption: m.admin_nav_bookings_caption,
  },
  {
    key: "discounts",
    href: `${ADMIN_BASE_PREFIX}/discounts`,
    label: m.admin_nav_discounts_label,
    icon: TicketPercent,
    caption: m.admin_nav_discounts_caption,
  },
  {
    key: "refunds",
    href: `${ADMIN_BASE_PREFIX}/refunds`,
    label: m.admin_nav_refunds_label,
    icon: Banknote,
    caption: m.admin_nav_refunds_caption,
  },
  {
    key: "complaints",
    group: m.admin_nav_group_moderation,
    href: `${ADMIN_BASE_PREFIX}/complaints`,
    label: m.admin_nav_complaints_label,
    icon: MessageSquareWarning,
    caption: m.admin_nav_complaints_caption,
  },
  {
    key: "approvals",
    group: m.admin_nav_group_moderation,
    href: `${ADMIN_BASE_PREFIX}/approvals`,
    label: m.admin_nav_approvals_label,
    icon: BadgeCheck,
    caption: m.admin_nav_approvals_caption,
  },
  {
    key: "reviews",
    group: m.admin_nav_group_moderation,
    href: `${ADMIN_BASE_PREFIX}/reviews`,
    label: m.admin_nav_reviews_label,
    icon: MessageSquareQuote,
    caption: m.admin_nav_reviews_caption,
  },
]
