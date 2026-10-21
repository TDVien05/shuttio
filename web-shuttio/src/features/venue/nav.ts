import {
  BarChart3,
  CalendarRange,
  LayoutDashboard,
  LayoutGrid,
  MessageSquare,
  Users,
} from "lucide-react"

import type { NavItem } from "@/features/dashboard/nav"
import { m } from "@/paraglide/messages"

export type VenueSectionKey =
  "command" | "schedule" | "courts" | "messages" | "analytics" | "customers"

export const VENUE_BASE_PREFIX = "/app/venue"

export function venueBase(venueId: string): string {
  return `${VENUE_BASE_PREFIX}/${venueId}`
}

export function venueNav(venueId: string): NavItem<VenueSectionKey>[] {
  const base = venueBase(venueId)
  return [
    {
      key: "command",
      href: base,
      label: m.venue_nav_command_label,
      icon: LayoutDashboard,
      caption: m.venue_nav_command_caption,
    },
    {
      key: "schedule",
      href: `${base}/schedule`,
      label: m.venue_nav_schedule_label,
      icon: CalendarRange,
      caption: m.venue_nav_schedule_caption,
    },
    {
      key: "courts",
      href: `${base}/courts`,
      label: m.venue_nav_courts_label,
      icon: LayoutGrid,
      caption: m.venue_nav_courts_caption,
    },
    {
      key: "messages",
      group: m.venue_nav_group_insights,
      href: `${base}/messages`,
      label: m.venue_nav_messages_label,
      icon: MessageSquare,
      caption: m.venue_nav_messages_caption,
    },
    {
      key: "analytics",
      group: m.venue_nav_group_insights,
      href: `${base}/analytics`,
      label: m.venue_nav_analytics_label,
      icon: BarChart3,
      caption: m.venue_nav_analytics_caption,
    },
    {
      key: "customers",
      group: m.venue_nav_group_insights,
      href: `${base}/customers`,
      label: m.venue_nav_customers_label,
      icon: Users,
      caption: m.venue_nav_customers_caption,
    },
  ]
}
