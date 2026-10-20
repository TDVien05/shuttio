import { Spinner } from "@/components/ui/spinner"
import { m } from "@/paraglide/messages"

export function RouteLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="grid min-h-vh-60 place-items-center p-6"
    >
      <div className="flex flex-col items-center gap-3">
        <Spinner className="size-8" />
        <span className="text-sm text-muted-foreground">
          {m.route_loading_label()}
        </span>
      </div>
    </div>
  )
}
