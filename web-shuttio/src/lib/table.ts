import {
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
} from "@tanstack/react-table"

/**
 * TanStack Table v9 features for the app's sortable data tables (venue
 * reservations/customers, the admin queues). The built-in sort functions are
 * registered so a column's default `"auto"` sort can pick one.
 */
export const sortableTable = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
    text: sortFn_text,
  },
})

export type SortableTable = typeof sortableTable
