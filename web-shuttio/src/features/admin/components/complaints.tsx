import { formatVndText } from "@/lib/money"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AdminPagination,
  useAdminPagination,
} from "@/features/admin/components/pagination"
import type { RoomComplaintRow } from "@/lib/shared"
import {
  VenuePanel,
  VenueEmpty,
  ReasonDialog,
} from "@/features/venue/components/shared"
import { useReasonConfirm } from "@/features/admin/hooks/use-reason-confirm"
import { resolveComplaint } from "@/features/admin/api/admin-api"
import { m } from "@/paraglide/messages"

const STATUS_VARIANT = {
  open: "default",
  refunded: "secondary",
  resolved: "secondary",
  dismissed: "outline",
} as const

const statusMessages = {
  open: m.admin_complaints_open,
  refunded: m.admin_complaints_refunded,
  resolved: m.admin_complaints_resolved,
  dismissed: m.admin_complaints_dismissed,
} as const

const kindMessages = {
  room_leave: m.admin_complaints_kind_room_leave,
  cancel_decline: m.admin_complaints_kind_cancel_decline,
  refund_not_received: m.admin_complaints_kind_refund_not_received,
} as const

/** Room-share complaints: members who paid but the host won't let them leave. */
export function AdminComplaintsView({
  complaints,
}: {
  complaints: RoomComplaintRow[]
}) {
  const pagination = useAdminPagination(complaints.length)
  const resolve = useReasonConfirm<RoomComplaintRow>((item, note) =>
    resolveComplaint(item.id, "resolve", note)
  )
  const dismiss = useReasonConfirm<RoomComplaintRow>((item, note) =>
    resolveComplaint(item.id, "dismiss", note)
  )

  return (
    <div className="flex flex-col gap-5">
      {complaints.length === 0 ? (
        <VenueEmpty text={m.admin_complaints_empty()} />
      ) : (
        <VenuePanel title={m.admin_complaints_title()}>
          <ul className="flex flex-col divide-y divide-border">
            {complaints
              .slice(pagination.offset, pagination.offset + pagination.pageSize)
              .map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {m.admin_complaints_from({
                          member: item.memberName,
                          host: item.hostName,
                        })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {kindMessages[item.kind]()} ·{" "}
                        {m.admin_complaints_room({ room: item.roomTitle })} ·{" "}
                        {item.createdAt.slice(8, 10)}/
                        {item.createdAt.slice(5, 7)}/
                        {item.createdAt.slice(0, 4)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="font-mono text-sm font-semibold tabular-nums">
                        {formatVndText(item.amount)}
                      </p>
                      <Badge variant={STATUS_VARIANT[item.status]}>
                        {statusMessages[item.status]()}
                      </Badge>
                    </div>
                  </div>
                  <p className="rounded-2xl bg-muted/50 px-3 py-2 text-sm">
                    {item.reason}
                  </p>
                  {item.adminNote ? (
                    <p className="text-xs text-muted-foreground">
                      {item.adminNote}
                    </p>
                  ) : null}
                  {item.venueViolations ? (
                    <p className="text-xs text-amber-600">
                      {m.admin_complaints_violations({
                        count: item.venueViolations,
                      })}
                    </p>
                  ) : null}
                  {item.status === "open" ? (
                    <div className="flex items-center gap-2">
                      <Button
                        shape="pill"
                        size="sm"

                        onPress={() => resolve.setTarget(item)}
                      >
                        {m.admin_complaints_resolve()}
                      </Button>
                      <Button
                        shape="pill"
                        size="sm"
                        variant="outline"

                        onPress={() => dismiss.setTarget(item)}
                      >
                        {m.admin_complaints_dismiss()}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
          </ul>
        </VenuePanel>
      )}

      <AdminPagination pagination={pagination} />

      <ReasonDialog
        {...resolve.dialogProps}
        title={m.admin_complaints_resolve_title()}
        description={m.admin_complaints_resolve_description()}
        reasonLabel={m.admin_complaints_note_label()}
        reasonPlaceholder={m.admin_complaints_note_placeholder()}
        cancelLabel={m.admin_complaints_back()}
        confirmLabel={m.admin_complaints_confirm()}
        // Matches the server's ResolveComplaintBodyDto.note @MaxLength(300).
        maxLength={300}
      />
      <ReasonDialog
        {...dismiss.dialogProps}
        title={m.admin_complaints_dismiss_title()}
        description={m.admin_complaints_dismiss_description()}
        reasonLabel={m.admin_complaints_note_label()}
        reasonPlaceholder={m.admin_complaints_note_placeholder()}
        cancelLabel={m.admin_complaints_back()}
        confirmLabel={m.admin_complaints_confirm()}
        maxLength={300}
      />
    </div>
  )
}
