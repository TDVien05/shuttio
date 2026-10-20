import * as React from "react"
import { BarChart3, Users } from "lucide-react"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { VenueAnalyticsView } from "@/features/venue/analytics"
import { VenueCustomersView } from "@/features/venue/customers"
import { m } from "@/paraglide/messages"

export type InsightsTab = "performance" | "players"

/**
 * The venue "Insights" surface. Revenue / utilization / demand analytics and
 * the player roster (regulars, retention, reach) are both "how is the business
 * doing" — so they share one section behind a segmented toggle instead of the
 * old Analytics + Players sidebar pair.
 */
export function VenueInsightsWorkspace({
  initialTab = "performance",
}: {
  initialTab?: InsightsTab
}) {
  const [tab, setTab] = React.useState<InsightsTab>(initialTab)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {m.venue_insights_title()}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {m.venue_insights_subtitle()}
          </p>
        </div>
        <Tabs
          selectedKey={tab}
          onSelectionChange={(v) => setTab(v as InsightsTab)}
        >
          <TabsList>
            <TabsTrigger id="performance">
              <BarChart3 />
              {m.venue_insights_tabs_performance()}
            </TabsTrigger>
            <TabsTrigger id="players">
              <Users />
              {m.venue_insights_tabs_players()}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {tab === "performance" ? (
        <VenueAnalyticsView embedded />
      ) : (
        <VenueCustomersView embedded />
      )}
    </div>
  )
}
