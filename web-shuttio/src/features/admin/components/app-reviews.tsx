import * as React from "react"
import { Eye, EyeOff, Star } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import type { AdminAppReviewRow } from "@/lib/shared"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AdminPagination,
  useAdminPagination,
} from "@/features/admin/components/pagination"
import { setAppReviewHidden } from "@/features/admin/api/admin-api"
import { VenueEmpty, VenuePanel } from "@/features/venue/components/shared"
import { m } from "@/paraglide/messages"

const roleMessages = {
  player: m.admin_app_reviews_role_player,
  venue: m.admin_app_reviews_role_venue,
} as const

/**
 * Moderation list for app reviews. Every review is listed; visible 4★+
 * reviews with enough text are what the landing page quotes, so hiding one
 * here takes it off the landing (and out of the average) immediately.
 */
export function AdminAppReviewsView({
  reviews,
}: {
  reviews: AdminAppReviewRow[]
}) {
  const [rows, setRows] = React.useState(reviews)
  const [pending, setPending] = React.useState<string | null>(null)
  const pagination = useAdminPagination(rows.length)

  const toggle = async (row: AdminAppReviewRow) => {
    setPending(row.userId)
    try {
      await setAppReviewHidden(row.userId, !row.hidden)
      setRows((current) =>
        current.map((r) =>
          r.userId === row.userId ? { ...r, hidden: !row.hidden } : r
        )
      )
      toast.success(
        row.hidden
          ? m.admin_app_reviews_shown()
          : m.admin_app_reviews_hidden_toast()
      )
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : m.admin_app_reviews_failed()
      )
    } finally {
      setPending(null)
    }
  }

  const dateFmt = new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeZone: "Asia/Ho_Chi_Minh",
  })

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {m.admin_app_reviews_title()}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {m.admin_app_reviews_subtitle()}
        </p>
      </div>

      {rows.length === 0 ? (
        <VenueEmpty text={m.admin_app_reviews_empty()} />
      ) : (
        <VenuePanel
          title={m.admin_app_reviews_list_title({ count: rows.length })}
        >
          <ul className="flex flex-col divide-y divide-border">
            {rows
              .slice(pagination.offset, pagination.offset + pagination.pageSize)
              .map((row) => (
                <li
                  key={row.id}
                  className={cn(
                    "flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0",
                    row.hidden && "opacity-60"
                  )}
                >
                  <div className="flex min-w-0 flex-1 gap-3">
                    <Avatar className="size-8 shrink-0">
                      <AvatarFallback size="xs">{row.initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{row.authorName}</p>
                        <span
                          className="flex text-amber-400"
                          aria-label={m.admin_app_reviews_rating_aria({
                            rating: row.rating,
                          })}
                        >
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              aria-hidden
                              className={cn(
                                "size-3.5",
                                s <= row.rating
                                  ? "fill-current"
                                  : "text-muted-foreground/40"
                              )}
                            />
                          ))}
                        </span>
                        <Badge variant="secondary">
                          {roleMessages[row.role]()}
                        </Badge>
                        {row.hidden ? (
                          <Badge variant="outline">
                            {m.admin_app_reviews_hidden_badge()}
                          </Badge>
                        ) : null}
                      </div>
                      {row.comment ? (
                        <p className="mt-1 text-sm whitespace-pre-line text-foreground/90">
                          {row.comment}
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-muted-foreground italic">
                          {m.admin_app_reviews_no_comment()}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {dateFmt.format(new Date(row.updatedAt))}
                      </p>
                    </div>
                  </div>
                  <Button
                    shape="pill"
                    size="sm"
                    variant="outline"

                    isDisabled={pending === row.userId}
                    onPress={() => void toggle(row)}
                  >
                    {row.hidden ? <Eye /> : <EyeOff />}
                    {row.hidden
                      ? m.admin_app_reviews_show()
                      : m.admin_app_reviews_hide()}
                  </Button>
                </li>
              ))}
          </ul>
        </VenuePanel>
      )}

      <AdminPagination pagination={pagination} />
    </div>
  )
}
