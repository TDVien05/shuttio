import { Link } from "@tanstack/react-router"

import { buttonVariants } from "@/components/ui/button"
import { m } from "@/paraglide/messages"

export function NotFound() {
  return (
    <div className="grid min-h-vh-60 place-items-center p-6 text-center">
      <div className="flex max-w-sm flex-col items-center gap-3">
        <h1 className="font-heading text-3xl font-bold">
          {m.common_not_found_title()}
        </h1>
        <p className="text-sm text-muted-foreground">
          {m.common_not_found_body()}
        </p>
        <Link to="/" className={buttonVariants({ className: "mt-2" })}>
          {m.common_back_home()}
        </Link>
      </div>
    </div>
  )
}
