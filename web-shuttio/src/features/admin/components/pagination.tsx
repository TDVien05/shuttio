import { cn } from "@/lib/utils"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"

export function useAdminPagination(total: number) {
  const [requestedPage, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(requestedPage, pageCount)

  // Persist the clamped page when a mutation removes the last page.
  if (page !== requestedPage) setPage(page)

  return {
    total,
    page,
    pageSize,
    pageCount,
    offset: (page - 1) * pageSize,
    setPage,
    setPageSize: (size: number) => {
      setPageSize(size)
      setPage(1)
    },
  }
}

export function AdminPagination({
  pagination,
  bleed = false,
}: {
  pagination: ReturnType<typeof useAdminPagination>
  /** Full-width footer pinned to the bottom of an edge-to-edge page. */
  bleed?: boolean
}) {
  const { total, page, pageSize, pageCount, offset, setPage, setPageSize } =
    pagination

  if (total === 0) return null

  return (
    <nav
      aria-label={m.admin_pagination_label()}
      className={cn(
        "flex flex-wrap items-center justify-between gap-3",
        bleed &&
          "sticky -bottom-4 -mx-4 mt-auto shrink-0 border-t bg-background px-4 py-2 sm:-bottom-6 sm:-mx-6 sm:min-h-12 sm:flex-nowrap sm:px-6 sm:py-0"
      )}
    >
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {m.admin_pagination_range({
          from: offset + 1,
          to: Math.min(offset + pageSize, total),
          total,
        })}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          {m.admin_pagination_page_size()}
          <select
            className="rounded-md border border-input bg-background px-2 py-1"
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
          >
            {[10, 20, 50].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          isDisabled={page === 1}
          onPress={() => setPage(page - 1)}
        >
          {m.admin_pagination_previous()}
        </Button>
        <label className="flex items-center gap-2 text-sm">
          {m.admin_pagination_page()}
          <select
            className="rounded-md border border-input bg-background px-2 py-1"
            value={page}
            onChange={(event) => setPage(Number(event.target.value))}
          >
            {Array.from({ length: pageCount }, (_, i) => i + 1).map(
              (number) => (
                <option key={number} value={number}>
                  {number}
                </option>
              )
            )}
          </select>
          / {pageCount}
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          isDisabled={page === pageCount}
          onPress={() => setPage(page + 1)}
        >
          {m.admin_pagination_next()}
        </Button>
      </div>
    </nav>
  )
}
