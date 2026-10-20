import * as React from "react"
import { flexRender, useTable } from "@tanstack/react-table"
import type { Column, ColumnDef, SortingState } from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { toast } from "sonner"

import { formatVndText } from "@/lib/money"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AdminPagination,
  useAdminPagination,
} from "@/features/admin/components/pagination"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { VenueEmpty } from "@/features/venue/components/shared"
import {
  createDiscount,
  deleteDiscount,
  updateDiscount,
} from "@/features/admin/api/admin-api"
import type {
  AdminDiscountInput,
  AdminDiscountRow,
} from "@/features/admin/types/admin-types"
import { sortableTable } from "@/lib/table"
import type { SortableTable } from "@/lib/table"
import { m } from "@/paraglide/messages"

type DiscountType = "percent" | "fixed"

/** One dialog target — `null` closed, otherwise which mode to render in. */
type DialogTarget = { mode: "create" } | { mode: "edit"; row: AdminDiscountRow }

/** `ISO string -> "YYYY-MM-DDTHH:mm"` for a `datetime-local` input's value. */
function toDatetimeLocal(iso?: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`
}

function formatValidity(row: AdminDiscountRow): string {
  if (!row.validFrom && !row.validUntil) return "—"
  const fmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString("vi-VN") : "∞"
  return `${fmt(row.validFrom)} – ${fmt(row.validUntil)}`
}

export function AdminDiscountsView({
  discounts,
}: {
  discounts: AdminDiscountRow[]
}) {
  const [rows, setRows] = React.useState(discounts)
  const [sorting, setSorting] = React.useState<SortingState>([])
  const pagination = useAdminPagination(rows.length)
  const [dialogTarget, setDialogTarget] = React.useState<DialogTarget | null>(
    null
  )
  const [togglingCode, setTogglingCode] = React.useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] =
    React.useState<AdminDiscountRow | null>(null)
  const [deletePending, setDeletePending] = React.useState(false)

  const handleSaved = (row: AdminDiscountRow, mode: "create" | "edit") => {
    setRows((current) =>
      mode === "create"
        ? [...current, row]
        : current.map((r) => (r.code === row.code ? row : r))
    )
  }

  const handleToggle = async (row: AdminDiscountRow) => {
    setTogglingCode(row.code)
    try {
      const updated = await updateDiscount(row.code, { active: !row.active })
      setRows((current) =>
        current.map((r) => (r.code === updated.code ? updated : r))
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed")
    } finally {
      setTogglingCode(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeletePending(true)
    try {
      await deleteDiscount(deleteTarget.code)
      setRows((current) => current.filter((r) => r.code !== deleteTarget.code))
      setDeleteTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed")
    } finally {
      setDeletePending(false)
    }
  }

  const headerCell = React.useCallback(
    (
      label: string,
      column: Column<SortableTable, AdminDiscountRow, unknown>
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

  const columns = React.useMemo<ColumnDef<SortableTable, AdminDiscountRow>[]>(
    () => [
      {
        accessorKey: "code",
        header: ({ column }) =>
          headerCell(m.admin_discounts_table_code(), column),
        cell: ({ row }) => (
          <span className="font-mono text-sm font-medium">
            {row.original.code}
          </span>
        ),
      },
      {
        accessorKey: "description",
        header: ({ column }) =>
          headerCell(m.admin_discounts_table_description(), column),
        cell: ({ row }) => (
          <span className="block max-w-55 truncate">
            {row.original.description}
          </span>
        ),
      },
      {
        accessorKey: "value",
        header: ({ column }) =>
          headerCell(m.admin_discounts_table_value(), column),
        cell: ({ row }) => {
          const r = row.original
          return r.type === "percent" ? (
            <span>
              {r.value}%
              {r.maxDiscount !== undefined ? (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({m.admin_discounts_dialog_max_discount()}:{" "}
                  {formatVndText(r.maxDiscount)})
                </span>
              ) : null}
            </span>
          ) : (
            formatVndText(r.value)
          )
        },
      },
      {
        accessorKey: "minOrder",
        header: ({ column }) =>
          headerCell(m.admin_discounts_table_conditions(), column),
        cell: ({ row }) => (
          <span>
            {row.original.minOrder !== undefined
              ? formatVndText(row.original.minOrder)
              : "—"}
          </span>
        ),
      },
      {
        id: "validity",
        enableSorting: false,
        header: () => m.admin_discounts_table_validity(),
        cell: ({ row }) => (
          <span className="text-sm whitespace-nowrap">
            {formatValidity(row.original)}
          </span>
        ),
      },
      {
        accessorKey: "usedCount",
        header: ({ column }) =>
          headerCell(m.admin_discounts_table_usage(), column),
        cell: ({ row }) => {
          const r = row.original
          return (
            <span className="text-sm whitespace-nowrap">
              {r.usedCount}/{r.usageLimit ?? m.admin_discounts_unlimited()}
              {r.perUserLimit !== undefined ? (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({m.admin_discounts_table_per_user({ count: r.perUserLimit })}
                  )
                </span>
              ) : null}
            </span>
          )
        },
      },
      {
        accessorKey: "active",
        header: ({ column }) =>
          headerCell(m.admin_discounts_table_status(), column),
        cell: ({ row }) => (
          <Badge variant={row.original.active ? "default" : "secondary"}>
            {row.original.active
              ? m.admin_discounts_status_active()
              : m.admin_discounts_status_inactive()}
          </Badge>
        ),
      },
      {
        id: "actions",
        enableSorting: false,
        header: () => (
          <div className="text-right">{m.admin_discounts_table_actions()}</div>
        ),
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="flex justify-end gap-2">
              <Button
                shape="pill"
                size="sm"
                variant="outline"

                onPress={() => setDialogTarget({ mode: "edit", row: r })}
              >
                {m.admin_discounts_actions_edit()}
              </Button>
              <Button
                shape="pill"
                size="sm"
                variant="outline"

                isDisabled={togglingCode === r.code}
                onPress={() => void handleToggle(r)}
              >
                {r.active
                  ? m.admin_discounts_actions_disable()
                  : m.admin_discounts_actions_enable()}
              </Button>
              {r.usedCount === 0 ? (
                <Button
                  shape="pill"
                  size="sm"
                  variant="destructive"

                  onPress={() => setDeleteTarget(r)}
                >
                  {m.admin_discounts_actions_delete()}
                </Button>
              ) : null}
            </div>
          )
        },
      },
    ],
    [headerCell, togglingCode]
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
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {m.admin_discounts_title()}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {m.admin_discounts_subtitle()}
          </p>
        </div>
        <Button
          shape="pill"

          onPress={() => setDialogTarget({ mode: "create" })}
        >
          {m.admin_discounts_create()}
        </Button>
      </div>

      {rows.length === 0 ? (
        <VenueEmpty text={m.admin_discounts_empty()} />
      ) : (
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {visibleRows.map((row) => (
              <TableRow key={row.original.code}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AdminPagination pagination={pagination} />

      <DiscountFormDialog
        target={dialogTarget}
        onClose={() => setDialogTarget(null)}
        onSaved={handleSaved}
      />

      <Dialog
        isOpen={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>{m.admin_discounts_delete_title()}</DialogTitle>
          <DialogDescription>
            {m.admin_discounts_delete_description({
              code: deleteTarget?.code ?? "",
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onPress={() => setDeleteTarget(null)}>
            {m.admin_discounts_delete_cancel()}
          </Button>
          <Button
            variant="destructive"
            isDisabled={deletePending}
            onPress={() => void handleDelete()}
          >
            {deletePending
              ? m.admin_discounts_delete_pending()
              : m.admin_discounts_delete_confirm()}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}

function DiscountFormDialog({
  target,
  onClose,
  onSaved,
}: {
  target: DialogTarget | null
  onClose: () => void
  onSaved: (row: AdminDiscountRow, mode: "create" | "edit") => void
}) {
  const [code, setCode] = React.useState("")
  const [type, setType] = React.useState<DiscountType>("percent")
  const [value, setValue] = React.useState("")
  const [maxDiscount, setMaxDiscount] = React.useState("")
  const [minOrder, setMinOrder] = React.useState("")
  const [usageLimit, setUsageLimit] = React.useState("")
  const [perUserLimit, setPerUserLimit] = React.useState("")
  const [validFrom, setValidFrom] = React.useState("")
  const [validUntil, setValidUntil] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [isPending, startTransition] = React.useTransition()

  const [prevTarget, setPrevTarget] = React.useState(target)
  if (target !== prevTarget) {
    setPrevTarget(target)
    if (target?.mode === "edit") {
      const row = target.row
      setCode(row.code)
      setType(row.type)
      setValue(String(row.value))
      setMaxDiscount(
        row.maxDiscount !== undefined ? String(row.maxDiscount) : ""
      )
      setMinOrder(row.minOrder !== undefined ? String(row.minOrder) : "")
      setUsageLimit(row.usageLimit !== undefined ? String(row.usageLimit) : "")
      setPerUserLimit(
        row.perUserLimit !== undefined ? String(row.perUserLimit) : ""
      )
      setValidFrom(toDatetimeLocal(row.validFrom))
      setValidUntil(toDatetimeLocal(row.validUntil))
      setDescription(row.description)
    } else if (target?.mode === "create") {
      setCode("")
      setType("percent")
      setValue("")
      setMaxDiscount("")
      setMinOrder("")
      setUsageLimit("")
      setPerUserLimit("")
      setValidFrom("")
      setValidUntil("")
      setDescription("")
    }
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!target) return
    startTransition(async () => {
      try {
        const cleared = target.mode === "edit" ? null : undefined
        const patch: Partial<AdminDiscountInput> = {
          type,
          value: Number(value),
          maxDiscount:
            type === "percent" && maxDiscount ? Number(maxDiscount) : cleared,
          minOrder: minOrder ? Number(minOrder) : cleared,
          usageLimit: usageLimit ? Number(usageLimit) : cleared,
          perUserLimit: perUserLimit ? Number(perUserLimit) : cleared,
          validFrom: validFrom ? new Date(validFrom).toISOString() : cleared,
          validUntil: validUntil ? new Date(validUntil).toISOString() : cleared,
          description,
        }
        if (target.mode === "create") {
          const created = await createDiscount({
            ...patch,
            code,
          } as AdminDiscountInput)
          onSaved(created, "create")
        } else {
          const updated = await updateDiscount(target.row.code, patch)
          onSaved(updated, "edit")
        }
        onClose()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Request failed")
      }
    })
  }

  return (
    <Dialog
      isOpen={target !== null}
      onOpenChange={(open) => !open && onClose()}
      className="sm:max-w-lg"
    >
      <DialogHeader>
        <DialogTitle>
          {target?.mode === "edit"
            ? m.admin_discounts_dialog_edit_title()
            : m.admin_discounts_dialog_create_title()}
        </DialogTitle>
      </DialogHeader>
      {target ? (
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {m.admin_discounts_dialog_code()}
            <Input
              required
              disabled={target.mode === "edit"}
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 text-sm font-medium">
              <span>{m.admin_discounts_dialog_type_label()}</span>
              <Select
                selectedKey={type}
                onSelectionChange={(k) => {
                  if (k) setType(k as DiscountType)
                }}
                className="w-full"
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem id="percent">
                    {m.admin_discounts_dialog_type_percent()}
                  </SelectItem>
                  <SelectItem id="fixed">
                    {m.admin_discounts_dialog_type_fixed()}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {m.admin_discounts_dialog_value()}
              <Input
                required
                min={1}
                type="number"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </label>
          </div>
          {type === "percent" ? (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {m.admin_discounts_dialog_max_discount()}
              <Input
                min={1}
                type="number"
                value={maxDiscount}
                onChange={(event) => setMaxDiscount(event.target.value)}
              />
            </label>
          ) : null}
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {m.admin_discounts_dialog_min_order()}
            <Input
              min={1}
              type="number"
              value={minOrder}
              onChange={(event) => setMinOrder(event.target.value)}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {m.admin_discounts_dialog_usage_limit()}
              <Input
                min={1}
                type="number"
                value={usageLimit}
                onChange={(event) => setUsageLimit(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {m.admin_discounts_dialog_per_user_limit()}
              <Input
                min={1}
                type="number"
                value={perUserLimit}
                onChange={(event) => setPerUserLimit(event.target.value)}
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {m.admin_discounts_dialog_valid_from()}
              <Input
                type="datetime-local"
                value={validFrom}
                onChange={(event) => setValidFrom(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {m.admin_discounts_dialog_valid_until()}
              <Input
                type="datetime-local"
                value={validUntil}
                onChange={(event) => setValidUntil(event.target.value)}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {m.admin_discounts_dialog_description()}
            <Input
              required
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onPress={onClose}>
              {m.admin_discounts_dialog_cancel()}
            </Button>
            <Button type="submit" isDisabled={isPending}>
              {isPending
                ? m.admin_discounts_dialog_saving()
                : m.admin_discounts_dialog_submit()}
            </Button>
          </DialogFooter>
        </form>
      ) : null}
    </Dialog>
  )
}
