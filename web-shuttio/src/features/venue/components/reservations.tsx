import {
  BLEED_TABLE_CLASS,
  TableSection,
} from "@/components/layouts/table-section"
import { DesktopOnly, RowCards } from "@/components/layouts/mobile-cards"
import { cva } from "class-variance-authority"
import { formatVndText } from "@/lib/money"
import * as React from "react"
import { getLocale } from "@/paraglide/runtime"
import { toast } from "sonner"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarClock,
  Check,
  Clock,
  Footprints,
  Receipt,
  Smartphone,
  Users,
  X,
} from "lucide-react"
import { createColumnHelper, flexRender, useTable } from "@tanstack/react-table"
import type { Column, SortingState } from "@tanstack/react-table"
import { sortableTable } from "@/lib/table"
import type { SortableTable } from "@/lib/table"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SportTag } from "@/features/dashboard/components/shared"
import {
  AdminPagination as ReservationPagination,
  useAdminPagination as useReservationPagination,
} from "@/features/admin/components/pagination"
import {
  MicroLabel,
  ReasonDialog,
  VenueEmpty,
} from "@/features/venue/components/shared"
import {
  useDecideReservation,
  useVenueData,
} from "@/features/venue/api/venue.queries"
import {
  PaymentProofDialog,
  RefundQueuePanel,
} from "@/features/venue/components/payment-review"
import { BOOKING_TRANSITIONS, locStr } from "@/lib/shared"
import type {
  BookingSource,
  Reservation,
  ReservationStatus,
} from "@/lib/shared"
import { m } from "@/paraglide/messages"

const sourceMessages = {
  app: m.venue_reservations_source_app,
  "walk-in": m.venue_reservations_source_walk_in,
} as const

const statusMessages = {
  awaiting_payment: m.venue_reservations_status_awaiting_payment,
  held: m.venue_reservations_status_held,
  pending: m.venue_reservations_status_pending,
  confirmed: m.venue_reservations_status_confirmed,
  "checked-in": m.venue_reservations_status_checked_in,
  completed: m.venue_reservations_status_completed,
  cancelled: m.venue_reservations_status_cancelled,
  "no-show": m.venue_reservations_status_no_show,
  expired: m.venue_reservations_status_expired,
} as const

const filtersMessages = {
  all: m.venue_reservations_filters_all,
  pending: m.venue_reservations_filters_pending,
  confirmed: m.venue_reservations_filters_confirmed,
  today: m.venue_reservations_filters_today,
  history: m.venue_reservations_filters_history,
} as const

type Decision = "approved" | "declined"

type FilterKey = "all" | "pending" | "confirmed" | "today" | "history"

const HISTORY_STATUSES: ReservationStatus[] = [
  "completed",
  "cancelled",
  "no-show",
]

const SOURCE_ICON: Record<
  BookingSource,
  React.ComponentType<{ className?: string }>
> = {
  app: Smartphone,
  "walk-in": Footprints,
}

/**
 * Per-column alignment / responsive-visibility classes, applied to both the
 * header cell and every body cell of that column so they hide together.
 */
const columnClassVariants = cva("", {
  variants: {
    column: {
      party: "hidden md:table-cell",
      source: "hidden lg:table-cell",
      price: "text-right",
      actions: "text-right",
    },
  },
})

const reservationStatusVariants = cva("", {
  variants: {
    status: {
      pending: "bg-chart-3/15 text-chart-3",
      confirmed: "bg-brand/12 text-brand",
      "checked-in": "bg-lime/20 text-brand",
      completed: "bg-muted text-muted-foreground",
      cancelled: "bg-muted text-muted-foreground line-through",
      "no-show": "bg-destructive/12 text-destructive",
      held: "bg-chart-3/12 text-chart-3",
    },
  },
})

// Column ids are free-form strings from the table; only the four known columns carry classes.
const columnClass = (id: string) =>
  columnClassVariants({
    column: id as "party" | "source" | "price" | "actions",
  })

function matchesFilter(r: Reservation, filter: FilterKey): boolean {
  switch (filter) {
    case "all":
      return true
    case "pending":
      return r.status === "pending"
    case "confirmed":
      return r.status === "confirmed"
    case "today":
      return (
        r.dayKey === "today" &&
        (r.status === "confirmed" ||
          r.status === "checked-in" ||
          r.status === "pending")
      )
    case "history":
      return HISTORY_STATUSES.includes(r.status)
  }
}

const columnHelper = createColumnHelper<SortableTable, Reservation>()

/**
 * Bookings table columns. Status comes straight from the query data; an
 * approve/decline mutation writes its optimistic result into that cache.
 */
function useReservationColumns(
  locale: string,
  onDecide: (r: Reservation, d: Decision) => void,
  onReview: (r: Reservation) => void
) {
  return React.useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor((r) => r.customer.name, {
          id: "customer",
          header: () => m.venue_reservations_col_customer(),
          enableSorting: false,
          cell: ({ row }) => {
            const r = row.original
            const declined = r.status === "cancelled"
            return (
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback tone="secondary" size="xs" weight="medium">
                    {r.customer.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn("font-medium", declined && "line-through")}
                    >
                      {r.customer.name}
                    </span>
                    {r.isRegular ? (
                      <Badge className="bg-lime/20 text-brand">
                        {m.venue_reservations_regular()}
                      </Badge>
                    ) : null}
                  </div>
                  {r.customer.phone ? (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {r.customer.phone}
                    </div>
                  ) : null}
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <SportTag sport={r.sport} />
                    <span aria-hidden>·</span>
                    <span>{r.court}</span>
                  </div>
                </div>
              </div>
            )
          },
        }),
        columnHelper.accessor((r) => r.time, {
          id: "when",
          header: () => m.venue_reservations_col_when(),
          enableSorting: false,
          cell: ({ row }) => {
            const r = row.original
            return (
              <div>
                <div className="inline-flex items-center gap-1 text-sm font-medium tabular-nums">
                  <Clock className="size-3.5 text-muted-foreground" />
                  {r.time}
                </div>
                <div className="mt-0.5 font-mono text-mini tracking-wider text-muted-foreground uppercase">
                  {locStr(r.day, locale)}
                </div>
              </div>
            )
          },
        }),
        columnHelper.accessor("party", {
          id: "party",
          header: ({ column }) => (
            <SortableHeader column={column}>
              {m.venue_reservations_col_party()}
            </SortableHeader>
          ),
          cell: ({ getValue }) => (
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground tabular-nums">
              <Users className="size-3.5" />
              {getValue()}
            </span>
          ),
        }),
        columnHelper.accessor("source", {
          id: "source",
          header: () => m.venue_reservations_col_channel(),
          enableSorting: false,
          cell: ({ getValue }) => {
            const source = getValue()
            const Icon = SOURCE_ICON[source]
            return (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                <Icon className="size-3" />
                {sourceMessages[source]()}
              </Badge>
            )
          },
        }),
        columnHelper.accessor("status", {
          id: "status",
          header: () => m.venue_reservations_col_status(),
          enableSorting: false,
          cell: ({ row }) => {
            const r = row.original
            const status = r.status
            return (
              <div className="flex flex-col items-start gap-1">
                <Badge
                  className={cn(
                    "capitalize",
                    reservationStatusVariants({ status })
                  )}
                >
                  {statusMessages[status]()}
                </Badge>
                {r.bookingStatus === "rejected_refund_pending" ? (
                  <Badge variant="warn" className="dark:text-amber-400">
                    {m.venue_reservations_refund_owed()}
                  </Badge>
                ) : null}
              </div>
            )
          },
        }),
        columnHelper.accessor("price", {
          id: "price",
          header: ({ column }) => (
            <SortableHeader column={column}>
              {m.venue_reservations_col_price()}
            </SortableHeader>
          ),
          cell: ({ getValue }) => (
            <span className="font-semibold tabular-nums">
              {formatVndText(getValue())}
            </span>
          ),
        }),
        columnHelper.display({
          id: "actions",
          header: () => (
            <span className="sr-only">
              {m.venue_reservations_col_actions()}
            </span>
          ),
          cell: ({ row }) => (
            <ReservationActions
              reservation={row.original}
              onDecide={onDecide}
              onReview={onReview}
            />
          ),
        }),
      ]),
    [locale, onDecide, onReview]
  )
}

export function VenueReservationsView({
  embedded = false,
}: {
  embedded?: boolean
} = {}) {
  const locale = getLocale()
  const {
    venueId,
    reservations: RESERVATIONS,
    refundQueue: REFUND_QUEUE,
  } = useVenueData()
  const decideMutation = useDecideReservation(venueId)

  const [filter, setFilter] = React.useState<FilterKey>("all")
  const [sorting, setSorting] = React.useState<SortingState>([])
  // A decline requires a reason (it flows back to the player's cancelled
  // booking), captured in this dialog before the action fires.
  const [declineTarget, setDeclineTarget] = React.useState<Reservation | null>(
    null
  )
  // The transfer screenshot being reviewed before approve / reject.
  const [reviewTarget, setReviewTarget] = React.useState<Reservation | null>(
    null
  )

  // ── Summary counts (against the source data, not the filtered slice) ──
  const pendingCount = RESERVATIONS.filter((r) => r.status === "pending").length
  const todayConfirmed = RESERVATIONS.filter(
    (r) =>
      r.day.en === "Today" &&
      (r.status === "confirmed" || r.status === "checked-in")
  ).length

  const data = React.useMemo(
    () => RESERVATIONS.filter((r) => matchesFilter(r, filter)),
    [filter, RESERVATIONS]
  )
  const pagination = useReservationPagination(data.length)

  const decide = React.useCallback(
    (r: Reservation, decision: Decision, reason?: string) => {
      const name = r.customer.name
      // The mutation writes its optimistic row into the venue-bundle cache and
      // rolls that cache back on failure; there is no separate overlay to keep.
      void decideMutation
        .mutateAsync({ id: r.id, decision, reason })
        .then(() => {
          if (decision === "approved") {
            toast.success(m.venue_reservations_toast_approved({ name }))
          } else {
            toast(m.venue_reservations_toast_declined({ name }))
          }
        })
        .catch((error) => {
          toast.error(
            error instanceof Error ? error.message : "Failed to update booking"
          )
        })
    },
    [decideMutation]
  )

  // Approve fires immediately; decline first collects a required reason.
  const handleDecide = React.useCallback(
    (r: Reservation, decision: Decision) => {
      if (decision === "declined") {
        setDeclineTarget(r)
      } else {
        decide(r, "approved")
      }
    },
    [decide]
  )

  const confirmDecline = (reason: string) => {
    const target = declineTarget
    if (!target || !reason) return
    setDeclineTarget(null)
    decide(target, "declined", reason)
  }

  const columns = useReservationColumns(locale, handleDecide, setReviewTarget)

  const table = useTable({
    features: sortableTable,
    data,
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
      setSorting(updater)
      pagination.setPage(1)
    },
    getRowId: (row) => row.id,
  })

  // Keep approvals first across the entire result set before taking a page.
  // Column sorting still applies within each status group.
  const sortedRows = table.getSortedRowModel().rows
  const needsApproval = (row: (typeof sortedRows)[number]) =>
    row.original.status === "pending"
  const orderedRows = [
    ...sortedRows.filter(needsApproval),
    ...sortedRows.filter((row) => !needsApproval(row)),
  ]
  const pageRows = orderedRows.slice(
    pagination.offset,
    pagination.offset + pagination.pageSize
  )

  const FILTERS: { key: FilterKey; count?: number }[] = [
    { key: "all", count: RESERVATIONS.length },
    { key: "pending", count: pendingCount },
    { key: "confirmed" },
    { key: "today" },
    { key: "history" },
  ]

  return (
    <div className="flex flex-col gap-5">
      {!embedded ? (
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {m.venue_reservations_title()}
          </h1>
          <p className="text-sm text-muted-foreground">
            {m.venue_reservations_subtitle()}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SummaryStat
          label={m.venue_reservations_summary_pending()}
          value={pendingCount}
          icon={CalendarClock}
          tone="amber"
          hint={m.venue_reservations_summary_pending_hint()}
        />
        <SummaryStat
          label={m.venue_reservations_summary_today_confirmed()}
          value={todayConfirmed}
          icon={Check}
          tone="brand"
          hint={m.venue_reservations_summary_today_confirmed_hint()}
        />
      </div>

      <TableSection
        title={m.venue_reservations_list_title()}
        icon={Users}
        action={
          <Tabs
            selectedKey={filter}
            onSelectionChange={(v) => {
              setFilter(v as FilterKey)
              pagination.setPage(1)
            }}
          >
            <TabsList variant="line" className="flex-wrap">
              {FILTERS.map((f) => (
                <TabsTrigger key={f.key} id={f.key}>
                  {filtersMessages[f.key]()}
                  {typeof f.count === "number" ? (
                    <span className="ml-1 font-mono text-mini text-muted-foreground/70 tabular-nums">
                      {f.count}
                    </span>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      >
        <DesktopOnly>
<Table className={BLEED_TABLE_CLASS}>
          <TableHeader>
            {table.getHeaderGroups().flatMap((hg) =>
              hg.headers.map((header) => {
                const sorted = header.column.getIsSorted()
                return (
                  <TableHead
                    key={header.id}
                    isRowHeader={header.index === 0}
                    aria-sort={
                      !header.column.getCanSort()
                        ? undefined
                        : sorted === "asc"
                          ? "ascending"
                          : sorted === "desc"
                            ? "descending"
                            : "none"
                    }
                    className={cn(
                      "h-9 font-mono text-mini font-medium tracking-wider text-muted-foreground uppercase",
                      columnClass(header.column.id)
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                )
              })
            )}
          </TableHeader>
          <TableBody>
            {pageRows.length ? (
              pageRows.map((row) => {
                const pendingDecision =
                  decideMutation.isPending &&
                  decideMutation.variables.id === row.original.id
                    ? decideMutation.variables.decision
                    : undefined
                return (
                  <TableRow
                    key={row.id}
                    className={cn(
                      pendingDecision === "declined"
                        ? "opacity-55 hover:bg-transparent"
                        : pendingDecision === "approved"
                          ? "bg-brand/5 hover:bg-brand/10"
                          : undefined
                    )}
                  >
                    {row.getAllCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={columnClass(cell.column.id)}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            ) : (
              <TableRow hover="none">
                <TableCell colSpan={columns.length} className="p-0 pt-2">
                  <VenueEmpty text={m.venue_reservations_empty()} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
</DesktopOnly>
{pageRows.length ? (
<RowCards
 rows={pageRows}
 labels={["", m.venue_reservations_col_when(), m.venue_reservations_col_party(), m.venue_reservations_col_channel(), m.venue_reservations_col_status(), m.venue_reservations_col_price(), ""]}
/>
) : (
<div className="md:hidden">
<VenueEmpty text={m.venue_reservations_empty()} />
</div>
)}
        <div className="border-t px-4 py-3 sm:px-6">
          <ReservationPagination pagination={pagination} />
        </div>
      </TableSection>

      {/* Refunds the venue owes: the player's account + QR, closed by a screenshot. */}
      <RefundQueuePanel items={REFUND_QUEUE} />

      <PaymentProofDialog
        reservation={reviewTarget}
        onOpenChange={(o) => {
          if (!o) setReviewTarget(null)
        }}
        onApprove={(r) => {
          setReviewTarget(null)
          decide(r, "approved")
        }}
        onReject={(r) => {
          setReviewTarget(null)
          handleDecide(r, "declined")
        }}
      />

      {/* Decline reason — required before the decline is sent to the player. */}
      <ReasonDialog
        open={declineTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeclineTarget(null)
        }}
        title={m.venue_reservations_decline_dialog_title()}
        description={m.venue_reservations_decline_dialog_description({
          name: declineTarget?.customer.name ?? "",
        })}
        reasonLabel={m.venue_reservations_decline_dialog_reason_label()}
        reasonPlaceholder={m.venue_reservations_decline_dialog_reason_placeholder()}
        cancelLabel={m.venue_reservations_decline_dialog_cancel()}
        confirmLabel={m.venue_reservations_decline_dialog_confirm()}
        presets={[
          m.venue_reservations_decline_dialog_presets_maintenance(),
          m.venue_reservations_decline_dialog_presets_already_booked(),
          m.venue_reservations_decline_dialog_presets_closed(),
          m.venue_reservations_decline_dialog_presets_invalid_info(),
        ]}
        onConfirm={confirmDecline}
      />
    </div>
  )
}

// ── Sortable column header ───────────────────────────────────────────────────

function SortableHeader<TValue>({
  column,
  children,
}: {
  column: Column<SortableTable, Reservation, TValue>
  children: React.ReactNode
}) {
  const sorted = column.getIsSorted()
  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(sorted === "asc")}
      className="-mx-1 inline-flex items-center gap-1 rounded px-1 uppercase transition-colors hover:text-foreground"
    >
      {children}
      {sorted === "asc" ? (
        <ArrowUp className="size-3" aria-hidden />
      ) : sorted === "desc" ? (
        <ArrowDown className="size-3" aria-hidden />
      ) : (
        <ArrowUpDown className="size-3 opacity-40" aria-hidden />
      )}
    </button>
  )
}

// ── Row actions ──────────────────────────────────────────────────────────────

function ReservationActions({
  reservation: r,
  onDecide,
  onReview,
}: {
  reservation: Reservation
  onDecide: (r: Reservation, d: Decision) => void
  onReview: (r: Reservation) => void
}) {
  // A "held" slot is payment-gated, not operator-actionable — it offers no
  // decision surface (and isn't a `BOOKING_TRANSITIONS` key). Guard before the
  // lookup so the six real operator statuses index cleanly below.
  if (r.status === "held") return null

  // Approve/decline is the pending-only decision surface: both target
  // statuses ("confirmed"/"cancelled") must be legal transitions off the
  // reservation's current status (see BOOKING_TRANSITIONS in
  // shared/helpers.ts) — today that only holds for "pending" — so the row
  // never offers an action the API would reject.
  const legalTargets = BOOKING_TRANSITIONS[r.status]
  const isPendingDecision =
    legalTargets.includes("confirmed") && legalTargets.includes("cancelled")
  if (isPendingDecision) {
    return (
      <div className="flex items-center justify-end gap-2">
        {r.paymentProofUrl ? (
          <Button
            shape="pill"
            variant="outline"
            size="sm"

            onPress={() => onReview(r)}
          >
            <Receipt />
            {m.venue_reservations_view_proof()}
          </Button>
        ) : null}
        <Button
          shape="pill"
          variant="outline"
          size="sm"

          onPress={() => onDecide(r, "declined")}
        >
          <X />
          {m.venue_reservations_decline()}
        </Button>
        <Button
          shape="pill"
          size="sm"

          onPress={() => onDecide(r, "approved")}
        >
          <Check />
          {m.venue_reservations_approve()}
        </Button>
      </div>
    )
  }

  return <span className="text-xs text-muted-foreground/50">—</span>
}

// ── Summary stat tile ────────────────────────────────────────────────────────

function SummaryStat({
  label,
  value,
  icon: Icon,
  tone,
  hint,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  tone: "brand" | "amber"
  hint: string
}) {
  const toneClass =
    tone === "amber" ? "bg-chart-3/15 text-chart-3" : "bg-brand/12 text-brand"
  return (
    <div className="flex items-center gap-4 rounded-4xl bg-card p-5 shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
      <div
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-2xl",
          toneClass
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <MicroLabel>{label}</MicroLabel>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="font-heading text-3xl leading-none font-bold tracking-tight tabular-nums">
            {value}
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  )
}
