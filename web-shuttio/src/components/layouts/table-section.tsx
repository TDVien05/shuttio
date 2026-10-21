import type { ComponentType, ReactNode } from "react"

import { cn } from "@/lib/utils"

/** Gives the first/last table cell the dashboard's page gutter. */
export const BLEED_TABLE_CLASS =
  "[&_tr>:first-child]:pl-4 sm:[&_tr>:first-child]:pl-6 [&_tr>:last-child]:pr-4 sm:[&_tr>:last-child]:pr-6"

/**
 * An edge-to-edge table section: a bordered toolbar (title left, actions right)
 * above a table that spans the full content width, escaping the page padding.
 */
export function TableSection({
  title,
  icon: Icon,
  action,
  children,
  className,
}: {
  title?: ReactNode
  icon?: ComponentType<{ className?: string }>
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("-mx-4 sm:-mx-6", className)}>
      {title || action ? (
        <header className="flex flex-wrap items-center justify-between gap-3 border-y px-4 py-3 sm:px-6">
          {title ? (
            <h2 className="inline-flex items-center gap-2 font-heading text-base font-semibold">
              {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action}
        </header>
      ) : null}
      {children}
    </section>
  )
}
