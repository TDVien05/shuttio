import * as React from "react"

/**
 * Epoch ms, refreshed every `everyMs`; null until mounted, so the first
 * render never depends on the clock (keeps render pure and hydration stable).
 */
export function useClock(everyMs = 30_000): number | null {
  const [now, setNow] = React.useState<number | null>(null)
  React.useEffect(() => {
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const id = setInterval(tick, everyMs)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [everyMs])
  return now
}
