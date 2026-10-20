import { formatVndText } from "@/lib/money"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  AdminPagination,
  useAdminPagination,
} from "@/features/admin/components/pagination"
import { locStr } from "@/lib/shared"
import {
  VenuePanel,
  VenueEmpty,
  ReasonDialog,
} from "@/features/venue/components/shared"
import { useReasonConfirm } from "@/features/admin/hooks/use-reason-confirm"
import { settleRefund } from "@/features/admin/api/admin-api"
import type { AdminRefundRow } from "@/features/admin/types/admin-types"
import { m } from "@/paraglide/messages"

export function AdminRefundsView({ refunds }: { refunds: AdminRefundRow[] }) {
  const pagination = useAdminPagination(refunds.length)
  const { setTarget, dialogProps } = useReasonConfirm<AdminRefundRow>(
    (item, ref) => settleRefund(item.bookingId, ref)
  )

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {m.admin_refunds_title()}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {m.admin_refunds_subtitle()}
        </p>
      </div>

      {refunds.length === 0 ? (
        <VenueEmpty text={m.admin_refunds_empty()} />
      ) : (
        <VenuePanel title={m.admin_refunds_title()}>
          <ul className="flex flex-col divide-y divide-border">
            {refunds
              .slice(pagination.offset, pagination.offset + pagination.pageSize)
              .map((item) => (
                <li
                  key={item.bookingId}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="size-8 shrink-0">
                      <AvatarFallback size="xs">
                        {item.customer.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {item.customer.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.venueId} · {item.court} · {locStr(item.day, "vi")}{" "}
                        · {item.time}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-mono text-sm font-semibold tabular-nums">
                        {formatVndText(item.refund.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {m.admin_refunds_pct({ pct: item.refund.pct })}
                      </p>
                    </div>
                    <Button
                      shape="pill"
                      size="sm"
                      variant="outline"

                      onPress={() => setTarget(item)}
                    >
                      {m.admin_refunds_settle_button()}
                    </Button>
                  </div>
                </li>
              ))}
          </ul>
        </VenuePanel>
      )}

      <AdminPagination pagination={pagination} />

      <ReasonDialog
        {...dialogProps}
        title={m.admin_refunds_settle_title()}
        description={m.admin_refunds_settle_description()}
        reasonLabel={m.admin_refunds_settle_ref_label()}
        reasonPlaceholder={m.admin_refunds_settle_ref_placeholder()}
        cancelLabel={m.admin_refunds_settle_cancel()}
        confirmLabel={m.admin_refunds_settle_confirm()}
        // Matches the server's SettleRefundDto.ref @MaxLength(120).
        maxLength={120}
      />
    </div>
  )
}
