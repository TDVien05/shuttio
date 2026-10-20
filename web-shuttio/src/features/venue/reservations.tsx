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
import { SportTag } from "@/features/dashboard/shared"
import {
  AdminPagination as ReservationPagination,
  useAdminPagination as useReservationPagination,
} from "@/features/admin/pagination"
import {
  MicroLabel,
  ReasonDialog,
  VenueEmpty,
  VenuePanel,
} from "@/features/venue/shared"
import { useVenueData } from "@/features/venue/venue-data-provider"
import { decideReservation } from "@/features/venue/venue-api"
import {
  PaymentProofDialog,
  RefundQueuePanel,
} from "@/features/venue/payment-review"
import {
  BOOKING_TRANSITIONS,
  locStr,
  reservationStatusAccent,
} from "@/features/venue/data"
import type {
  BookingSource,
  Reservation,
  ReservationStatus,
} from "@/features/venue/data"
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
const COLUMN_CLASS: Record<string, string> = {
  party: "hidden md:table-cell",
  source: "hidden lg:table-cell",
  price: "text-right",
  actions: "text-right",
}

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

/** Effective status reflects an operator decision on a pending row. */
function effectiveStatus(
  r: Reservation,
  decision?: Decision
): ReservationStatus {
  if (decision === "approved") return "confirmed"
  if (decision === "declined") return "cancelled"
  return r.status
}

const columnHelper = createColumnHelper<SortableTable, Reservation>()

/**
 * Bookings table columns. Cells close over the operator's in-flight decisions
 * and callbacks; columns rebuild on change, which is free here since the table
 * is small and React Compiler already opts this component out of memoization.
 */
function useReservationColumns(
  locale: string,
  decisions: Partial<Record<string, Decision>>,
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
            const declined = decisions[r.id] === "declined"
            return (
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback className="bg-secondary text-xs font-medium text-secondary-foreground">
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
                <div className="mt-0.5 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
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
            const status = effectiveStatus(r, decisions[r.id])
            return (
              <div className="flex flex-col items-start gap-1">
                <Badge
                  className={cn("capitalize", reservationStatusAccent[status])}
                >
                  {statusMessages[status]()}
                </Badge>
                {r.bookingStatus === "rejected_refund_pending" ? (
                  <Badge className="bg-amber-500/12 text-amber-700 dark:text-amber-400">
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
              decision={decisions[row.original.id]}
              onDecide={onDecide}
              onReview={onReview}
            />
          ),
        }),
      ]),
    [locale, decisions, onDecide, onReview]
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
    updateReservation,
  } = useVenueData()

  const [filter, setFilter] = React.useState<FilterKey>("all")
  // Optimistic overlay of just-decided rows — shows the "decided" affordance and
  // status the instant the operator acts; the server action (below) persists the
  // real status and `updateReservation` folds it into the shared data.
  const [decisions, setDecisions] = React.useState<
    Partial<Record<string, Decision>>
  >({})
  const [, startTransition] = React.useTransition()
  const [sorting, setSorting] = React.useState<SortingState>([])
  // A decline requires a reason (it flows back to the player's cancelled
  // booking), captured in this dialog before the action fires.
  const [declineTarget, setDeclineTarget] = React.useState<Reservation | null>(
    null
  )
  const [declineReason, setDeclineReason] = React.useState("")
  // The transfer screenshot being reviewed before approve / reject.
  const [reviewTarget, setReviewTarget] = React.useState<Reservation | null>(
    null
  )

  // ── Summary counts (against the source data, not the filtered slice) ──
  const pendingCount = RESERVATIONS.filter(
    (r) => effectiveStatus(r, decisions[r.id]) === "pending"
  ).length
  const todayConfirmed = RESERVATIONS.filter(
    (r) =>
      r.day.en === "Today" &&
      (r.status === "confirmed" || r.status === "checked-in")
  ).length

  const data = React.useMemo(
    () =>
      RESERVATIONS.filter((r) =>
        matchesFilter(
          { ...r, status: effectiveStatus(r, decisions[r.id]) },
          filter
        )
      ),
    [filter, RESERVATIONS, decisions]
  )
  const pagination = useReservationPagination(data.length)

  const decide = React.useCallback(
    (r: Reservation, decision: Decision, reason?: string) => {
      const name = r.customer.name
      // Optimistically mark the row, then persist. Roll the overlay back if the
      // server rejects it.
      setDecisions((prev) => ({ ...prev, [r.id]: decision }))
      startTransition(async () => {
        try {
          const updated = await decideReservation(
            venueId,
            r.id,
            decision,
            reason
          )
          updateReservation(r.id, {
            status: updated.status,
            declineReason: updated.declineReason,
          })
          if (decision === "approved") {
            toast.success(m.venue_reservations_toast_approved({ name }))
          } else {
            toast(m.venue_reservations_toast_declined({ name }))
          }
        } catch (error) {
          setDecisions((prev) => {
            const next = { ...prev }
            delete next[r.id]
            return next
          })
          toast.error(
            error instanceof Error ? error.message : "Failed to update booking"
          )
        }
      })
    },
    [venueId, updateReservation]
  )

  // Approve fires immediately; decline first collects a required reason.
  const handleDecide = React.useCallback(
    (r: Reservation, decision: Decision) => {
      if (decision === "declined") {
        setDeclineReason("")
        setDeclineTarget(r)
      } else {
        decide(r, "approved")
      }
    },
    [decide]
  )

  const confirmDecline = () => {
    const target = declineTarget
    const reason = declineReason.trim()
    if (!target || !reason) return
    setDeclineTarget(null)
    decide(target, "declined", reason)
  }

  const columns = useReservationColumns(
    locale,
    decisions,
    handleDecide,
    setReviewTarget
  )

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
    effectiveStatus(row.original, decisions[row.original.id]) === "pending"
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

      <VenuePanel
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
                    <span className="ml-1 font-mono text-[11px] text-muted-foreground/70 tabular-nums">
                      {f.count}
                    </span>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  return (
                    <TableHead
                      key={header.id}
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
                        "h-9 font-mono text-[11px] font-medium tracking-wider text-muted-foreground uppercase",
                        COLUMN_CLASS[header.column.id]
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
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {pageRows.length ? (
              pageRows.map((row) => {
                const decision = decisions[row.original.id]
                return (
                  <TableRow
                    key={row.id}
                    className={cn(
                      decision === "declined"
                        ? "opacity-55 hover:bg-transparent"
                        : decision === "approved"
                          ? "bg-brand/5 hover:bg-brand/10"
                          : undefined
                    )}
                  >
                    {row.getAllCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={COLUMN_CLASS[cell.column.id]}
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
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="p-0 pt-2">
                  <VenueEmpty text={m.venue_reservations_empty()} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="mt-4 border-t border-border pt-4">
          <ReservationPagination pagination={pagination} />
        </div>
      </VenuePanel>

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
        reason={declineReason}
        onReasonChange={setDeclineReason}
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
  decision,
  onDecide,
  onReview,
}: {
  reservation: Reservation
  decision?: Decision
  onDecide: (r: Reservation, d: Decision) => void
  onReview: (r: Reservation) => void
}) {
  if (decision != null) {
    return decision === "approved" ? (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand">
        <Check className="size-3.5" />
        {m.venue_reservations_decided_approved()}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <X className="size-3.5" />
        {m.venue_reservations_decided_declined()}
      </span>
    )
  }

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
            variant="outline"
            size="sm"
            className="rounded-full"
            onPress={() => onReview(r)}
          >
            <Receipt />
            {m.venue_reservations_view_proof()}
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          onPress={() => onDecide(r, "declined")}
        >
          <X />
          {m.venue_reservations_decline()}
        </Button>
        <Button
          size="sm"
          className="rounded-full"
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
