import {
  BLEED_TABLE_CLASS,
  TableSection,
} from "@/components/layouts/table-section"
import * as React from "react"
import { toast } from "sonner"

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
import { VenueEmpty } from "@/features/venue/components/shared"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useAdminActions } from "@/features/admin/api/admin-api"
import type { AdminActionResult } from "@/features/admin/api/admin-api"
import { ContactPhone } from "@/features/admin/components/contact-phone"
import type {
  AdminBrandGroup,
  AdminVenueRow,
} from "@/features/admin/types/admin-types"
import { m } from "@/paraglide/messages"

const APPROVAL_VARIANT = {
  pending: "outline",
  approved: "secondary",
  rejected: "destructive",
} as const

const approvalMessages = {
  pending: m.admin_venues_approval_pending,
  approved: m.admin_venues_approval_approved,
  rejected: m.admin_venues_approval_rejected,
} as const

export function AdminVenuesView({ groups }: { groups: AdminBrandGroup[] }) {
  const admin = useAdminActions()
  const [pending, setPending] = React.useState<string | null>(null)

  const [removing, setRemoving] = React.useState<{
    ownerId: string
    name: string
  } | null>(null)

  const [deletingVenue, setDeletingVenue] = React.useState<{
    id: string
    name: string
  } | null>(null)

  // The client actions return a result object (a thrown error's message is
  // redacted in production), so the reason — e.g. "still has future
  // bookings" — reaches the toast.
  const run = async (
    id: string,
    action: () => Promise<AdminActionResult>,
    success?: string
  ) => {
    setPending(id)
    try {
      const result = await action()
      if (result.ok) {
        if (success) toast.success(success)
      } else {
        toast.error(result.message)
      }
      return result.ok
    } catch {
      toast.error("Request failed")
      return false
    } finally {
      setPending(null)
    }
  }

  const handleSuspend = (venue: AdminVenueRow) =>
    void run(venue.id, () => admin.suspendVenue(venue.id))

  const handleRestore = (venue: AdminVenueRow) =>
    void run(venue.id, () => admin.restoreVenue(venue.id))

  const confirmDeleteVenue = async () => {
    if (!deletingVenue) return
    const ok = await run(
      `delete-${deletingVenue.id}`,
      () => admin.deleteVenue(deletingVenue.id),
      m.admin_venues_delete_venue_done()
    )
    if (ok) setDeletingVenue(null)
  }

  const confirmRemove = async () => {
    if (!removing) return
    const ok = await run(
      removing.ownerId,
      () => admin.removeVenueOwner(removing.ownerId),
      m.admin_venues_remove_owner_done()
    )
    if (ok) setRemoving(null)
  }

  const totalVenues = groups.reduce((n, g) => n + g.venues.length, 0)
  const pagination = useAdminPagination(totalVenues)
  let groupOffset = 0
  const visibleGroups = groups.flatMap((group, index) => {
    const start = groupOffset
    groupOffset += group.venues.length
    const venues = group.venues.slice(
      Math.max(0, pagination.offset - start),
      Math.max(0, pagination.offset + pagination.pageSize - start)
    )
    return venues.length
      ? [{ ...group, venues, key: group.brand?.id ?? `ownerless-${index}` }]
      : []
  })

  return (
    <div className="flex flex-col gap-5">
      {totalVenues === 0 ? (
        <VenueEmpty text={m.admin_venues_empty()} />
      ) : (
        visibleGroups.map((group) => (
          <TableSection
            key={group.key}
            title={group.brand?.name ?? m.admin_venues_no_brand()}
            action={
              group.brand ? (
                <div className="flex items-center gap-3">
                  <ContactPhone
                    phone={group.brand.contactPhone}
                    emptyLabel={m.admin_venues_no_phone()}
                  />
                  <Button
                    shape="pill"
                    size="sm"
                    variant="destructive"

                    isDisabled={pending === group.brand.ownerId}
                    onPress={() =>
                      setRemoving({
                        ownerId: group.brand!.ownerId,
                        name: group.brand!.name,
                      })
                    }
                  >
                    {m.admin_venues_remove_owner_button()}
                  </Button>
                </div>
              ) : null
            }
          >
            <Table className={BLEED_TABLE_CLASS}>
              <TableHeader>
                <TableHead>{m.admin_venues_table_venue()}</TableHead>
                <TableHead>{m.admin_venues_table_ward()}</TableHead>
                <TableHead>{m.admin_venues_table_approval()}</TableHead>
                <TableHead>{m.admin_venues_table_status()}</TableHead>
                <TableHead align="right">
                  {m.admin_venues_table_bookings()}
                </TableHead>
                <TableHead align="right">
                  {m.admin_venues_table_revenue()}
                </TableHead>
                <TableHead align="right">
                  {m.admin_venues_table_actions()}
                </TableHead>
              </TableHeader>
              <TableBody>
                {group.venues.map((venue) => (
                  <TableRow key={venue.id}>
                    <TableCell weight="medium">{venue.name}</TableCell>
                    <TableCell>{venue.ward}</TableCell>
                    <TableCell>
                      <Badge
                        variant={APPROVAL_VARIANT[venue.approval ?? "approved"]}
                      >
                        {approvalMessages[venue.approval ?? "approved"]()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={venue.archived ? "outline" : "secondary"}>
                        {venue.archived
                          ? m.admin_venues_status_archived()
                          : m.admin_venues_status_active()}
                      </Badge>
                    </TableCell>
                    <TableCell align="right" numeric="yes">
                      {venue.bookings}
                    </TableCell>
                    <TableCell
                      align="right"
                      numeric="yes"
                      className="font-mono"
                    >
                      {formatVndText(venue.revenue)}
                    </TableCell>
                    <TableCell align="right">
                      <div className="flex items-center justify-end gap-2">
                        {venue.archived ? (
                          <Button
                            shape="pill"
                            size="sm"
                            variant="outline"

                            isDisabled={pending === venue.id}
                            onPress={() => handleRestore(venue)}
                          >
                            {m.admin_venues_restore()}
                          </Button>
                        ) : (
                          <Button
                            shape="pill"
                            size="sm"
                            variant="destructive"

                            isDisabled={pending === venue.id}
                            onPress={() => handleSuspend(venue)}
                          >
                            {m.admin_venues_suspend()}
                          </Button>
                        )}
                        <Button
                          shape="pill"
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          isDisabled={pending === `delete-${venue.id}`}
                          onPress={() =>
                            setDeletingVenue({ id: venue.id, name: venue.name })
                          }
                        >
                          {m.admin_venues_delete_venue_button()}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableSection>
        ))
      )}
      <AdminPagination pagination={pagination} />
      <AlertDialog
        isOpen={deletingVenue !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setDeletingVenue(null)
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {m.admin_venues_delete_venue_title({
              name: deletingVenue?.name ?? "",
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {m.admin_venues_delete_venue_body()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel isDisabled={pending !== null}>
            {m.admin_venues_delete_venue_cancel()}
          </AlertDialogCancel>
          <Button
            variant="destructive"
            isDisabled={pending !== null}
            onPress={() => void confirmDeleteVenue()}
          >
            {m.admin_venues_delete_venue_confirm()}
          </Button>
        </AlertDialogFooter>
      </AlertDialog>
      <AlertDialog
        isOpen={removing !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setRemoving(null)
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {m.admin_venues_remove_owner_title({
              name: removing?.name ?? "",
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {m.admin_venues_remove_owner_body()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel isDisabled={pending !== null}>
            {m.admin_venues_remove_owner_cancel()}
          </AlertDialogCancel>
          <Button
            variant="destructive"
            isDisabled={pending !== null}
            onPress={() => void confirmRemove()}
          >
            {m.admin_venues_remove_owner_confirm()}
          </Button>
        </AlertDialogFooter>
      </AlertDialog>
    </div>
  )
}
