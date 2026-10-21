import { BLEED_TABLE_CLASS } from "@/components/layouts/table-section"
import * as React from "react"
import { flexRender, useTable } from "@tanstack/react-table"
import type { Column, ColumnDef, SortingState } from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"

import { formatVndText } from "@/lib/money"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AdminPagination,
  useAdminPagination,
} from "@/features/admin/components/pagination"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { VenueEmpty, ReasonDialog } from "@/features/venue/components/shared"
import { useReasonConfirm } from "@/features/admin/hooks/use-reason-confirm"
import { forceCancelBooking } from "@/features/admin/api/admin-api"
import type { AdminBookingRow } from "@/features/admin/types/admin-types"
import { sortableTable } from "@/lib/table"
import type { SortableTable } from "@/lib/table"
import { m } from "@/paraglide/messages"

const CANCELLABLE = new Set(["pending", "confirmed", "checked-in"])

const STATUS_VARIANT: Partial<
  Record<
    AdminBookingRow["status"],
    "default" | "secondary" | "destructive" | "outline"
  >
> = {
  awaiting_payment: "outline",
  pending: "outline",
  confirmed: "secondary",
  "checked-in": "secondary",
  completed: "default",
  expired: "outline",
  cancelled: "destructive",
  "no-show": "destructive",
}

const PAYMENT_VARIANT: Partial<
  Record<
    AdminBookingRow["paymentStatus"],
    "default" | "secondary" | "destructive" | "outline"
  >
> = {
  awaiting: "outline",
  paid: "secondary",
  refunded: "destructive",
  partial_refund: "destructive",
  none: "outline",
}

const statusMessages: Partial<Record<AdminBookingRow["status"], () => string>> =
  {
    awaiting_payment: m.admin_bookings_status_awaiting_payment,
    pending: m.admin_bookings_status_pending,
    confirmed: m.admin_bookings_status_confirmed,
    "checked-in": m.admin_bookings_status_checked_in,
    completed: m.admin_bookings_status_completed,
    cancelled: m.admin_bookings_status_cancelled,
    "no-show": m.admin_bookings_status_no_show,
    expired: m.admin_bookings_status_expired,
  }

const paymentStatusMessages: Partial<
  Record<AdminBookingRow["paymentStatus"], () => string>
> = {
  awaiting: m.admin_bookings_payment_status_awaiting,
  paid: m.admin_bookings_payment_status_paid,
  refunded: m.admin_bookings_payment_status_refunded,
  partial_refund: m.admin_bookings_payment_status_partial_refund,
  none: m.admin_bookings_payment_status_none,
}

export function AdminBookingsView({
  bookings,
}: {
  bookings: AdminBookingRow[]
}) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const pagination = useAdminPagination(bookings.length)
  const { setTarget, dialogProps } = useReasonConfirm<AdminBookingRow>(
    (booking, reason) => forceCancelBooking(booking.bookingId, reason)
  )

  const headerCell = React.useCallback(
    (
      label: string,
      column: Column<SortableTable, AdminBookingRow, unknown>
    ) => (
      <button
        type="button"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="group inline-flex items-center gap-1 text-left font-mono text-mini tracking-wider text-muted-foreground uppercase transition-colors hover:text-foreground"
      >
        {label}
        {column.getIsSorted() === "asc" ? (
          <ArrowUp className="size-3 text-brand" />
        ) : column.getIsSorted() === "desc" ? (
          <ArrowDown className="size-3 text-brand" />
        ) : (
          <ArrowUpDown className="size-3 opacity-30 transition-opacity group-hover:opacity-100" />
        )}
      </button>
    ),
    []
  )

  const headerCellRight = React.useCallback(
    (
      label: string,
      column: Column<SortableTable, AdminBookingRow, unknown>
    ) => (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="group inline-flex items-center gap-1 text-right font-mono text-mini tracking-wider text-muted-foreground uppercase transition-colors hover:text-foreground"
        >
          {label}
          {column.getIsSorted() === "asc" ? (
            <ArrowUp className="size-3 text-brand" />
          ) : column.getIsSorted() === "desc" ? (
            <ArrowDown className="size-3 text-brand" />
          ) : (
            <ArrowUpDown className="size-3 opacity-30 transition-opacity group-hover:opacity-100" />
          )}
        </button>
      </div>
    ),
    []
  )

  const columns = React.useMemo<ColumnDef<SortableTable, AdminBookingRow>[]>(
    () => [
      {
        accessorKey: "bookingId",
        header: ({ column }) =>
          headerCell(m.admin_bookings_table_booking(), column),
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.bookingId}</span>
        ),
      },
      {
        accessorKey: "venueId",
        header: ({ column }) =>
          headerCell(m.admin_bookings_table_venue(), column),
        cell: ({ row }) => <span>{row.original.venueId}</span>,
      },
      {
        accessorKey: "courtName",
        header: ({ column }) =>
          headerCell(m.admin_bookings_table_court(), column),
        cell: ({ row }) => <span>{row.original.courtName}</span>,
      },
      {
        accessorKey: "startAt",
        header: ({ column }) =>
          headerCell(m.admin_bookings_table_when(), column),
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {row.original.dateKey} · {row.original.start}
          </span>
        ),
      },
      {
        accessorKey: "price",
        header: ({ column }) =>
          headerCellRight(m.admin_bookings_table_price(), column),
        cell: ({ row }) => (
          <div className="text-right font-mono tabular-nums">
            {formatVndText(row.original.price)}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: ({ column }) =>
          headerCell(m.admin_bookings_table_status(), column),
        cell: ({ row }) => {
          const status = row.original.status
          return (
            <Badge variant={STATUS_VARIANT[status] ?? "outline"}>
              {statusMessages[status]?.() ?? status}
            </Badge>
          )
        },
      },
      {
        accessorKey: "paymentStatus",
        header: ({ column }) =>
          headerCell(m.admin_bookings_table_payment(), column),
        cell: ({ row }) => {
          const status = row.original.paymentStatus
          return (
            <Badge variant={PAYMENT_VARIANT[status] ?? "outline"}>
              {paymentStatusMessages[status]?.() ?? status}
            </Badge>
          )
        },
      },
      {
        id: "actions",
        enableSorting: false,
        header: () => (
          <div className="text-right">{m.admin_bookings_table_actions()}</div>
        ),
        cell: ({ row }) => {
          const b = row.original
          return (
            <div className="text-right">
              {CANCELLABLE.has(b.status) ? (
                <Button
                  shape="pill"
                  size="sm"
                  variant="destructive"

                  onPress={() => setTarget(b)}
                >
                  {m.admin_bookings_cancel_button()}
                </Button>
              ) : null}
            </div>
          )
        },
      },
    ],
    [headerCell, headerCellRight, setTarget]
  )

  const table = useTable({
    features: sortableTable,
    data: bookings,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
  })

  const visibleRows = table
    .getRowModel()
    .rows.slice(pagination.offset, pagination.offset + pagination.pageSize)

  return (
    <div className="-m-4 flex flex-1 flex-col gap-5 px-4 pb-0 sm:-m-6 sm:px-6 sm:pb-0">
      {bookings.length === 0 ? (
        <VenueEmpty text={m.admin_bookings_empty()} />
      ) : (
        <div className="-mx-4 sm:-mx-6">
          <Table className={BLEED_TABLE_CLASS}>
            <TableHeader>
              {table
                .getHeaderGroups()
                .flatMap((headerGroup) =>
                  headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))
                )}
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => (
                <TableRow key={row.original.bookingId}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AdminPagination bleed pagination={pagination} />

      <ReasonDialog
        {...dialogProps}
        title={m.admin_bookings_cancel_title()}
        description={m.admin_bookings_cancel_description()}
        reasonLabel={m.admin_bookings_cancel_reason_label()}
        reasonPlaceholder={m.admin_bookings_cancel_reason_placeholder()}
        cancelLabel={m.admin_bookings_cancel_cancel()}
        confirmLabel={m.admin_bookings_cancel_confirm()}
      />
    </div>
  )
}
