import * as React from "react"

import { useUserLocation } from "@/hooks/use-user-location"
import type { GeoStatus } from "@/hooks/use-user-location"
import type { Coordinates } from "@/lib/shared/location"

interface LocationContextValue {
  userLoc: Coordinates | null
  geoStatus: GeoStatus
  requestLocation: () => Promise<Coordinates | null>
}

const LocationContext = React.createContext<LocationContextValue | null>(null)

/**
 * One browser-geolocation store for the dashboard. Mounted outside
 * `DataProvider` so court distances and every "near me" control read the same
 * state; it never asks for permission until the player presses a locate
 * button.
 */
export function LocationProvider({ children }: { children: React.ReactNode }) {
  const value = useUserLocation()
  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  )
}

export function useUserLocationContext() {
  const ctx = React.useContext(LocationContext)
  if (!ctx) {
    throw new Error(
      "useUserLocationContext must be used within a LocationProvider."
    )
  }
  return ctx
}
