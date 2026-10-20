import { cn } from "cn"
import { Loader2Icon } from "lucide-react"

/** The app's single loading indicator — a spinning ring in the brand blue. */
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      data-slot="spinner"
      aria-hidden
      className={cn("size-6 animate-spin text-brand", className)}
      {...props}
    />
  )
}

export { Spinner }
