import {
  BadgeCheck,
  Banknote,
  Building2,
  CalendarClock,
  CircleDollarSign,
  RadioTower,
  Users,
} from "lucide-react"

import { formatVndText } from "@/lib/money"
import { VenueStat } from "@/features/venue/components/shared"
import type { AdminOverview } from "@/features/admin/types/admin-types"
import { m } from "@/paraglide/messages"

export function AdminOverviewView({ overview }: { overview: AdminOverview }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {m.admin_overview_greeting()}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {m.admin_overview_subtitle()}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <VenueStat
          label={m.admin_overview_kpi_users()}
          value={String(overview.users)}
          icon={Users}
        />
        <VenueStat
          label={m.admin_overview_kpi_brands()}
          value={String(overview.brands)}
          icon={Building2}
        />
        <VenueStat
          label={m.admin_overview_kpi_venues()}
          value={String(overview.venues.total)}
          icon={Building2}
        />
        <VenueStat
          label={m.admin_overview_kpi_venues_pending()}
          value={String(overview.venues.pending)}
          icon={BadgeCheck}
          invert
        />
        <VenueStat
          label={m.admin_overview_kpi_bookings()}
          value={String(overview.bookings)}
          icon={CalendarClock}
        />
        <VenueStat
          label={m.admin_overview_kpi_gross_revenue()}
          value={formatVndText(overview.grossRevenue)}
          icon={CircleDollarSign}
        />
        <VenueStat
          label={m.admin_overview_kpi_active_sessions()}
          value={String(overview.activeSessions)}
          icon={RadioTower}
        />
        <VenueStat
          label={m.admin_overview_kpi_pending_refunds()}
          value={String(overview.pendingRefunds)}
          icon={Banknote}
          invert
        />
      </div>
    </div>
  )
}
