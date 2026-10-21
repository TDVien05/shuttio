import * as React from "react"

import { useSessionData } from "@/features/play/hooks/use-session-data"
import { useSessionUi } from "@/features/play/state/session-ui"

/**
 * Reports newly lapsed holds/RSVPs to the session UI store. Mounted once in the
 * dashboard layout; each expiry produces one toast and one client-only
 * notification, however many times the derived view is recomputed.
 */
export function SessionExpiryWatcher() {
  const { expiredEvents } = useSessionData()
  const { addExpiredEvents } = useSessionUi()

  React.useEffect(() => {
    if (expiredEvents.length) addExpiredEvents(expiredEvents)
  }, [expiredEvents, addExpiredEvents])

  return null
}
