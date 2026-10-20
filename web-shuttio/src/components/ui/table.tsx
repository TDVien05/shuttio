"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import {
  Cell as CellPrimitive,
  Column as ColumnPrimitive,
  Row as RowPrimitive,
  TableBody as TableBodyPrimitive,
  TableFooter as TableFooterPrimitive,
  TableHeader as TableHeaderPrimitive,
  Table as TablePrimitive,
  type CellProps,
  type ColumnProps,
  type RowProps,
  type TableBodyProps,
  type TableFooterProps,
  type TableHeaderProps,
  type TableProps,
} from "react-aria-components"

function Table({ className, ...props }: TableProps) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <TablePrimitive
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader<T>({ className, ...props }: TableHeaderProps<T>) {
  return (
    <TableHeaderPrimitive
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody<T>({ className, ...props }: TableBodyProps<T>) {
  return (
    <TableBodyPrimitive
      data-slot="table-body"
      className={cn(
        "data-empty:h-24 data-empty:text-center [&_tr:last-child]:border-0",
        className
      )}
      {...props}
    />
  )
}

function TableFooter<T>({ className, ...props }: TableFooterProps<T>) {
  return (
    <TableFooterPrimitive
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

const tableRowVariants = cva(
  "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted data-selected:bg-muted",
  {
    variants: {
      hover: {
        default: "",
        none: "hover:bg-transparent",
        subtle: "hover:bg-muted/40",
      },
    },
    defaultVariants: { hover: "default" },
  }
)

function TableRow<T>({
  className,
  hover,
  ...props
}: RowProps<T> & VariantProps<typeof tableRowVariants>) {
  return (
    <RowPrimitive
      data-slot="table-row"
      className={cn(tableRowVariants({ hover }), className)}
      {...props}
    />
  )
}

const tableHeadVariants = cva(
  "h-12 px-3 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([data-slot=checkbox])]:pr-0 [&:has([role=checkbox])]:pr-0",
  {
    variants: {
      density: {
        default: "",
        compact: "h-10 px-4 py-2",
      },
      align: {
        left: "",
        right: "text-right",
      },
    },
    defaultVariants: { density: "default", align: "left" },
  }
)

function TableHead({
  className,
  density,
  align,
  ...props
}: ColumnProps & VariantProps<typeof tableHeadVariants>) {
  return (
    <ColumnPrimitive
      data-slot="table-head"
      className={cn(tableHeadVariants({ density, align }), className)}
      {...props}
    />
  )
}

const tableCellVariants = cva(
  "p-3 align-middle whitespace-nowrap [&:has([data-slot=checkbox])]:pr-0 [&:has([role=checkbox])]:pr-0",
  {
    variants: {
      density: {
        default: "",
        roomy: "px-4 py-3",
      },
      align: {
        left: "",
        right: "text-right",
      },
      size: {
        default: "",
        sm: "text-sm",
      },
      numeric: {
        no: "",
        yes: "tabular-nums",
      },
      tone: {
        default: "",
        muted: "text-muted-foreground",
        strong: "text-foreground",
      },
      weight: {
        default: "",
        medium: "font-medium",
        semibold: "font-semibold",
      },
    },
    defaultVariants: {
      density: "default",
      align: "left",
      size: "default",
      numeric: "no",
      tone: "default",
      weight: "default",
    },
  }
)

function TableCell({
  className,
  density,
  align,
  size,
  numeric,
  tone,
  weight,
  ...props
}: CellProps & VariantProps<typeof tableCellVariants>) {
  return (
    <CellPrimitive
      data-slot="table-cell"
      className={cn(
        tableCellVariants({ density, align, size, numeric, tone, weight }),
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"figcaption">) {
  return (
    <figcaption
      data-slot="table-caption"
      className={cn(
        "mt-4 text-center text-sm text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
