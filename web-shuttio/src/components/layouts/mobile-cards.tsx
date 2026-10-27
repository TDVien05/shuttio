import type { ReactNode } from "react"
import { flexRender } from "@tanstack/react-table"
import type { Row } from "@tanstack/react-table"

import { cn } from "@/lib/utils"
import type { SortableTable } from "@/lib/table"

/** Wrap a desktop `<Table>` so it is replaced by `MobileCardList` below `md`. */
export function DesktopOnly({ children }: { children: ReactNode }) {
  return <div className="hidden md:block">{children}</div>
}

/** Card list shown instead of a table on phones; sits inside a `TableSection`. */
export function MobileCardList({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col gap-3 px-4 py-3 md:hidden">{children}</ul>
}

/** One record: a title row, label/value pairs, then an optional action row. */
export function MobileCard({
  title,
  badge,
  fields,
  actions,
  className,
}: {
  title: ReactNode
  badge?: ReactNode
  fields?: { label: ReactNode; value: ReactNode }[]
  actions?: ReactNode
  className?: string
}) {
  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-sm font-medium">{title}</div>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </div>
      {fields?.length ? (
        <dl className="flex flex-col gap-1.5 text-sm">
          {fields.map((field, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 text-xs text-muted-foreground">
                {field.label}
              </dt>
              <dd className="min-w-0 text-right">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {actions ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
          {actions}
        </div>
      ) : null}
    </li>
  )
}

/**
 * Cards for the rows of a TanStack table: the first column is the title, a
 * column with id `actions` becomes the action row, every other column is a
 * label/value pair. `labels[i]` names the i-th column (cell order).
 */
export function RowCards<TData>({
  rows,
  labels,
  className,
}: {
  rows: Row<SortableTable, TData>[]
  labels: string[]
  className?: (row: Row<SortableTable, TData>) => string | undefined
}) {
  return (
    <MobileCardList>
      {rows.map((row) => {
        const cells = row.getAllCells()
        const render = (cell: (typeof cells)[number]) =>
          flexRender(cell.column.columnDef.cell, cell.getContext())
        const actions = cells.find((c) => c.column.id === "actions")
        return (
          <MobileCard
            key={row.id}
            className={className?.(row)}
            title={cells[0] ? render(cells[0]) : null}
            fields={cells.flatMap((cell, i) =>
              i === 0 || cell === actions
                ? []
                : [{ label: labels[i], value: render(cell) }]
            )}
            actions={actions ? render(actions) : undefined}
          />
        )
      })}
    </MobileCardList>
  )
}
