"use client"

import * as React from "react"
import { hasCoordinates } from "@/lib/shared/location"
import type { Coordinates } from "@/lib/shared/location"

export type GeoStatus = "locating" | "on" | "off"

export function useUserLocation() {
  const [userLoc, setUserLoc] = React.useState<Coordinates | null>(null)
  // Never prompt on mount: only an explicit "near me" action requests the
  // browser permission.
  const [geoStatus, setGeoStatus] = React.useState<GeoStatus>("off")
  const requestLocation = React.useCallback(() => {
    setGeoStatus("locating")
    return new Promise<Coordinates | null>((resolve) => {
      const unavailable = () => {
        setUserLoc(null)
        setGeoStatus("off")
        resolve(null)
      }
      if (!("geolocation" in navigator)) return unavailable()
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          }
          if (!hasCoordinates(location)) return unavailable()
          setUserLoc(location)
          setGeoStatus("on")
          resolve(location)
        },
        unavailable,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      )
    })
  }, [])

  return { userLoc, geoStatus, requestLocation }
}
