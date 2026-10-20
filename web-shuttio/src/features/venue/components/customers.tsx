import { formatVndText } from "@/lib/money"
import * as React from "react"
import { getLocale } from "@/paraglide/runtime"
import { toast } from "sonner"
import { z } from "zod"
import {
  ArrowDownRight,
  ArrowUpDown,
  ArrowUpRight,
  ArrowUp,
  ArrowDown,
  Plus,
  TrendingDown,
  Users,
} from "lucide-react"
import { flexRender, useTable } from "@tanstack/react-table"
import type { Column, ColumnDef, SortingState } from "@tanstack/react-table"
import { sortableTable } from "@/lib/table"
import type { SortableTable } from "@/lib/table"

import { FormError, useAppForm } from "@/components/form"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { customerTierAccent, locStr } from "@/lib/shared"
import type { CustomerTier, VenueCustomer } from "@/lib/shared"
import { useVenueData } from "@/features/venue/components/venue-data-provider"
import { createCustomer } from "@/features/venue/api/venue-api"
import { VenueEmpty, VenuePanel } from "@/features/venue/components/shared"
import { SportTag } from "@/features/dashboard/components/shared"
import { m } from "@/paraglide/messages"

const tiersMessages = {
  vip: m.venue_customers_tiers_vip,
  regular: m.venue_customers_tiers_regular,
  new: m.venue_customers_tiers_new,
  "at-risk": m.venue_customers_tiers_at_risk,
} as const

const segmentsMessages = {
  all: m.venue_customers_segments_all,
  vip: m.venue_customers_segments_vip,
  regular: m.venue_customers_segments_regular,
  new: m.venue_customers_segments_new,
  "at-risk": m.venue_customers_segments_at_risk,
} as const

type Segment = "all" | CustomerTier

const SEGMENTS: Segment[] = ["all", "vip", "regular", "new", "at-risk"]

function parseRelativeDate(localized: { en: string; vi: string }): number {
  const en = localized.en.toLowerCase()
  if (en.includes("today")) return 0
  if (en.includes("yesterday")) return 1
  const daysMatch = en.match(/(\d+)\s+days?\s+ago/)
  if (daysMatch && daysMatch[1]) return parseInt(daysMatch[1], 10)
  const weeksMatch = en.match(/(\d+)\s+weeks?\s+ago/)
  if (weeksMatch && weeksMatch[1]) return parseInt(weeksMatch[1], 10) * 7
  return 9999
}

export function VenueCustomersView({
  embedded = false,
}: {
  embedded?: boolean
} = {}) {
  const locale = getLocale()
  const {
    venueId,
    venueCustomers: VENUE_CUSTOMERS,
    addCustomer,
  } = useVenueData()
  const [segment, setSegment] = React.useState<Segment>("all")
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [isAddOpen, setIsAddOpen] = React.useState(false)

  const total = VENUE_CUSTOMERS.length

  const countFor = React.useCallback(
    (seg: Segment) =>
      seg === "all"
        ? total
        : VENUE_CUSTOMERS.filter((c) => c.tier === seg).length,
    [total, VENUE_CUSTOMERS]
  )

  const rows = React.useMemo(
    () =>
      VENUE_CUSTOMERS.filter(
        (c) => segment === "all" || c.tier === segment
      ).slice(),
    [segment, VENUE_CUSTOMERS]
  )

  const tierLabel = React.useCallback(
    (tier: CustomerTier) => tiersMessages[tier](),
    []
  )

  const headerCell = React.useCallback(
    (label: string, column: Column<SortableTable, VenueCustomer, unknown>) => {
      return (
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
      )
    },
    []
  )

  const headerCellRight = React.useCallback(
    (label: string, column: Column<SortableTable, VenueCustomer, unknown>) => {
      return (
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
      )
    },
    []
  )

  const columns = React.useMemo<
    ColumnDef<SortableTable, VenueCustomer>[]
  >(() => {
    return [
      {
        accessorKey: "name",
        header: ({ column }) =>
          headerCell(m.venue_customers_col_customer(), column),
        cell: ({ row }) => {
          const c = row.original
          return (
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarFallback tone="secondary" size="xs" weight="medium">
                  {c.initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-foreground">
                    {c.name}
                  </span>
                  <TierChip tier={c.tier} label={tierLabel(c.tier)} />
                </div>
                <span className="font-mono text-mini text-muted-foreground tabular-nums">
                  {m.venue_customers_visits_unit({ count: c.visits })}
                </span>
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: "id",
        header: ({ column }) =>
          headerCell(m.venue_customers_col_phone(), column),
        cell: ({ row }) => (
          <span className="font-mono text-sm text-muted-foreground">
            {row.original.id}
          </span>
        ),
      },
      {
        accessorKey: "favoriteSport",
        header: ({ column }) =>
          headerCell(m.venue_customers_col_sport(), column),
        cell: ({ row }) => <SportTag sport={row.original.favoriteSport} />,
      },
      {
        accessorKey: "visits",
        header: ({ column }) =>
          headerCellRight(m.venue_customers_col_visits(), column),
        cell: ({ row }) => (
          <div className="text-right font-heading text-sm font-semibold text-foreground tabular-nums">
            {row.original.visits}
          </div>
        ),
      },
      {
        accessorKey: "lastVisit",
        header: ({ column }) =>
          headerCell(m.venue_customers_col_last_visit(), column),
        cell: ({ row }) => {
          const c = row.original
          const trendUp = c.trend >= 0
          const flat = c.trend === 0
          return (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {locStr(c.lastVisit, locale)}
              </span>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold tabular-nums",
                  flat
                    ? "text-muted-foreground"
                    : trendUp
                      ? "text-brand"
                      : "text-destructive"
                )}
              >
                {flat ? (
                  <TrendingDown className="size-3.5 opacity-40" />
                ) : trendUp ? (
                  <ArrowUpRight className="size-3.5" />
                ) : (
                  <ArrowDownRight className="size-3.5" />
                )}
                {flat ? "—" : `${trendUp ? "+" : ""}${c.trend}%`}
              </span>
            </div>
          )
        },
        sortFn: (rowA, rowB) => {
          const aVal = parseRelativeDate(rowA.original.lastVisit)
          const bVal = parseRelativeDate(rowB.original.lastVisit)
          return aVal - bVal
        },
      },
      {
        accessorKey: "ltv",
        header: ({ column }) =>
          headerCellRight(m.venue_customers_col_ltv(), column),
        cell: ({ row }) => (
          <div className="text-right font-heading text-sm font-semibold text-brand tabular-nums">
            {formatVndText(row.original.ltv)}
          </div>
        ),
      },
      {
        accessorKey: "noShowRate",
        header: ({ column }) =>
          headerCellRight(m.venue_customers_col_no_show(), column),
        cell: ({ row }) => {
          const c = row.original
          return (
            <div
              className={cn(
                "text-right text-sm font-medium tabular-nums",
                c.noShowRate >= 15
                  ? "text-destructive"
                  : c.noShowRate > 0
                    ? "text-muted-foreground"
                    : "text-muted-foreground/50"
              )}
            >
              {c.noShowRate}
              <span className="text-mini text-muted-foreground/70">
                {m.venue_customers_no_show_suffix()}
              </span>
            </div>
          )
        },
      },
    ]
  }, [locale, tierLabel, headerCell, headerCellRight])

  const table = useTable({
    features: sortableTable,
    data: rows,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
  })

  return (
    <div className="flex flex-col gap-5">
      {!embedded ? (
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {m.venue_customers_title()}
          </h1>
          <p className="text-sm text-muted-foreground">
            {m.venue_customers_subtitle()}
          </p>
        </div>
      ) : null}

      <VenuePanel
        title={m.venue_customers_list_title()}
        icon={Users}
        action={
          <div className="flex items-center gap-3">
            <Tabs
              selectedKey={segment}
              onSelectionChange={(v) => setSegment(v as Segment)}
            >
              <TabsList variant="line" className="flex-wrap">
                {SEGMENTS.map((seg) => (
                  <TabsTrigger key={seg} id={seg}>
                    {segmentsMessages[seg]()}
                    <span className="ml-1.5 font-mono text-micro text-muted-foreground tabular-nums">
                      {countFor(seg)}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button shape="pill" size="sm" onPress={() => setIsAddOpen(true)}>
              <Plus className="mr-1 size-4" />
              {m.venue_customers_add_button()}
            </Button>
          </div>
        }
      >
        {rows.length ? (
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/50">
            <Table>
              <TableHeader className="bg-muted/30">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow hover="none" key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead density="compact" key={header.id}>
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
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className={cn(
                      "transition-colors",
                      row.original.tier === "at-risk"
                        ? "bg-destructive/[0.02] hover:bg-destructive/[0.06] data-[state=selected]:bg-destructive/[0.08]"
                        : "hover:bg-muted/40"
                    )}
                  >
                    {row.getAllCells().map((cell) => (
                      <TableCell density="roomy" key={cell.id}>
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
        ) : (
          <VenueEmpty text={m.venue_customers_empty()} />
        )}
      </VenuePanel>
      <AddCustomerDialog
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onAdd={addCustomer}
        venueId={venueId}
        customersList={VENUE_CUSTOMERS}
      />
    </div>
  )
}

function TierChip({ tier, label }: { tier: CustomerTier; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-mini font-medium",
        customerTierAccent[tier]
      )}
    >
      {label}
    </span>
  )
}

interface AddCustomerDialogProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (customer: VenueCustomer) => void
  venueId: string
  customersList: VenueCustomer[]
}

const addCustomerSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().min(1),
})

function AddCustomerDialog({
  isOpen,
  onClose,
  onAdd,
  venueId,
  customersList,
}: AddCustomerDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      className="sm:max-w-md"
    >
      <DialogHeader>
        <DialogTitle>{m.venue_customers_add_dialog_title()}</DialogTitle>
        <DialogDescription>
          {m.venue_customers_add_dialog_description()}
        </DialogDescription>
      </DialogHeader>
      {/* Mounted only while open, so every open starts empty. */}
      {isOpen ? (
        <AddCustomerForm
          venueId={venueId}
          customersList={customersList}
          onAdd={onAdd}
          onClose={onClose}
        />
      ) : null}
    </Dialog>
  )
}

function AddCustomerForm({
  onClose,
  onAdd,
  venueId,
  customersList,
}: Omit<AddCustomerDialogProps, "isOpen">) {
  const [error, setError] = React.useState("")
  const form = useAppForm({
    defaultValues: { name: "", phone: "" },
    validators: { onChange: addCustomerSchema },
    onSubmit: async ({ value }) => {
      setError("")
      const name = value.name.trim()
      const phone = value.phone.trim()
      // Cheap client-side duplicate guard for instant feedback; the server
      // also enforces this (unique phone → 409) and is the source of truth.
      if (customersList.some((c) => c.id === phone)) {
        setError(m.venue_customers_add_dialog_duplicate())
        return
      }
      try {
        const created = await createCustomer(venueId, {
          name,
          phone,
          favoriteSport: "badminton",
        })
        onAdd(created)
        toast.success(m.venue_customers_add_dialog_added())
        onClose()
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : m.venue_customers_add_dialog_add_error()
        )
      }
    },
  })

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FormError>{error}</FormError>
      <form.AppField name="name">
        {(field) => (
          <field.TextField
            label={m.venue_customers_add_dialog_name()}
            placeholder={m.venue_customers_add_dialog_name_placeholder()}
          />
        )}
      </form.AppField>
      <form.AppField name="phone">
        {(field) => (
          <field.TextField
            label={m.venue_customers_add_dialog_phone()}
            type="tel"
            placeholder={m.venue_customers_add_dialog_phone_placeholder()}
          />
        )}
      </form.AppField>
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="outline" onPress={onClose}>
          {m.venue_customers_add_dialog_cancel()}
        </Button>
        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting] as const}
        >
          {([canSubmit, isSubmitting]) => (
            <Button type="submit" isDisabled={!canSubmit || isSubmitting}>
              {isSubmitting
                ? m.venue_customers_add_dialog_saving()
                : m.venue_customers_add_dialog_submit()}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}
