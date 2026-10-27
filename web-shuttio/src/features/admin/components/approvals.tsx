import { BLEED_TABLE_CLASS } from "@/components/layouts/table-section"
import {
  DesktopOnly,
  RowCards,
} from "@/components/layouts/mobile-cards"
import * as React from "react"
import { flexRender, useTable } from "@tanstack/react-table"
import type { Column, ColumnDef, SortingState } from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { toast } from "sonner"

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
import { ContactPhone } from "@/features/admin/components/contact-phone"
import { useReasonConfirm } from "@/features/admin/hooks/use-reason-confirm"
import { useAdminActions } from "@/features/admin/api/admin-api"
import type { AdminApprovalRow } from "@/features/admin/types/admin-types"
import { sortableTable } from "@/lib/table"
import type { SortableTable } from "@/lib/table"
import { m } from "@/paraglide/messages"

export function AdminApprovalsView({ brands }: { brands: AdminApprovalRow[] }) {
  const admin = useAdminActions()
  const [rows, setRows] = React.useState(brands)
  const [sorting, setSorting] = React.useState<SortingState>([])
  const pagination = useAdminPagination(rows.length)
  const [pending, setPending] = React.useState<string | null>(null)

  const { setTarget, dialogProps } = useReasonConfirm<AdminApprovalRow>(
    (row, reason) => admin.rejectBrand(row.brand.id, reason),
    (row) =>
      setRows((current) => current.filter((r) => r.brand.id !== row.brand.id))
  )

  const handleApprove = async (row: AdminApprovalRow) => {
    setPending(row.brand.id)
    try {
      await admin.approveBrand(row.brand.id)
      setRows((current) => current.filter((r) => r.brand.id !== row.brand.id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed")
    } finally {
      setPending(null)
    }
  }

  const headerCell = React.useCallback(
    (
      label: string,
      column: Column<SortableTable, AdminApprovalRow, unknown>
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

  const columns = React.useMemo<ColumnDef<SortableTable, AdminApprovalRow>[]>(
    () => [
      {
        id: "brand",
        accessorFn: (row) => row.brand.name,
        header: ({ column }) =>
          headerCell(m.admin_approvals_table_brand(), column),
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{row.original.brand.name}</span>
            <ContactPhone
              phone={row.original.brand.contactPhone}
              emptyLabel={m.admin_approvals_no_phone()}
            />
          </div>
        ),
      },
      {
        id: "branches",
        header: () => m.admin_approvals_table_branches(),
        enableSorting: false,
        cell: ({ row }) => {
          const venues = row.original.venues
          if (venues.length === 0) {
            return <span className="text-muted-foreground">—</span>
          }
          return (
            <div className="flex flex-col gap-0.5">
              {venues.map((venue) => (
                <span key={venue.id} className="text-sm">
                  {venue.name}
                  <span className="text-muted-foreground">
                    {" · "}
                    {venue.ward}, {venue.province}
                  </span>
                </span>
              ))}
            </div>
          )
        },
      },
      {
        id: "actions",
        enableSorting: false,
        header: () => (
          <div className="text-right">{m.admin_approvals_table_actions()}</div>
        ),
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button
              shape="pill"
              size="sm"

              isDisabled={pending === row.original.brand.id}
              onPress={() => void handleApprove(row.original)}
            >
              {m.admin_approvals_approve()}
            </Button>
            <Button
              shape="pill"
              size="sm"
              variant="destructive"

              isDisabled={pending === row.original.brand.id}
              onPress={() => setTarget(row.original)}
            >
              {m.admin_approvals_reject_button()}
            </Button>
          </div>
        ),
      },
    ],
    [headerCell, pending, setTarget]
  )

  const table = useTable({
    features: sortableTable,
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
  })

  const visibleRows = table
    .getRowModel()
    .rows.slice(pagination.offset, pagination.offset + pagination.pageSize)

  return (
    <div className="-m-4 flex flex-1 flex-col gap-5 px-4 pb-0 sm:-m-6 sm:px-6 sm:pb-0">
      {rows.length === 0 ? (
        <VenueEmpty text={m.admin_approvals_empty()} />
      ) : (
        <div className="-mx-4 sm:-mx-6">
          <DesktopOnly>
<Table className={BLEED_TABLE_CLASS}>
            <TableHeader>
              {table
                .getHeaderGroups()
                .flatMap((headerGroup) =>
                  headerGroup.headers.map((header) => (
                    <TableHead key={header.id} isRowHeader={header.index === 0}>
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
                <TableRow key={row.original.brand.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id} className="align-top">
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
</DesktopOnly>
<RowCards
 rows={visibleRows}
 labels={["", m.admin_approvals_table_branches(), ""]}
/>
        </div>
      )}

      <AdminPagination bleed pagination={pagination} />

      <ReasonDialog
        {...dialogProps}
        title={m.admin_approvals_reject_title()}
        description={m.admin_approvals_reject_description()}
        reasonLabel={m.admin_approvals_reject_reason_label()}
        reasonPlaceholder={m.admin_approvals_reject_reason_placeholder()}
        cancelLabel={m.admin_approvals_reject_cancel()}
        confirmLabel={m.admin_approvals_reject_confirm()}
      />
    </div>
  )
}
