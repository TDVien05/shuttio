import * as React from "react"
import Map, { Marker, NavigationControl } from "react-map-gl/mapbox"
import type { MapRef } from "react-map-gl/mapbox"
import { MapPin } from "lucide-react"

import "mapbox-gl/dist/mapbox-gl.css"

import { MAPBOX_TOKEN } from "@/lib/env"

export type PickedLocation = { lat: number; lng: number }

// Ho Chi Minh City — the framing before anything is pinned.
const HCMC = { longitude: 106.7009, latitude: 10.7769, zoom: 11.5 }

/**
 * A small map the host taps (or drags the pin on) to mark where the court
 * they booked outside the app is. Check-in is later measured against this
 * point. Loaded lazily by the Create Room dialog so Mapbox only ships when a
 * self-booked room is being made. Renders nothing without a Mapbox token —
 * the dialog's "use my location" button still works then.
 */
export default function SelfCourtLocationPicker({
  value,
  onChange,
}: {
  value: PickedLocation | null
  onChange: (next: PickedLocation) => void
}) {
  const mapRef = React.useRef<MapRef>(null)

  // Follow a pin set from outside (the "use my location" button).
  React.useEffect(() => {
    if (!value) return
    mapRef.current?.flyTo({
      center: [value.lng, value.lat],
      zoom: Math.max(mapRef.current.getZoom(), 15),
      duration: 600,
    })
  }, [value])

  if (!MAPBOX_TOKEN) return null

  return (
    <div className="h-48 overflow-hidden rounded-2xl ring-1 ring-border">
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={
          value ? { longitude: value.lng, latitude: value.lat, zoom: 15 } : HCMC
        }
        mapStyle="mapbox://styles/mapbox/light-v11"
        style={{ width: "100%", height: "100%" }}
        cursor="crosshair"
        onClick={(e) => onChange({ lat: e.lngLat.lat, lng: e.lngLat.lng })}
      >
        <NavigationControl position="top-right" showCompass={false} />
        {value ? (
          <Marker
            longitude={value.lng}
            latitude={value.lat}
            anchor="center"
            draggable
            onDragEnd={(e) =>
              onChange({ lat: e.lngLat.lat, lng: e.lngLat.lng })
            }
          >
            <span className="grid size-8 place-items-center rounded-full bg-brand text-brand-foreground shadow-md ring-2 ring-card">
              <MapPin className="size-4" />
            </span>
          </Marker>
        ) : null}
      </Map>
    </div>
  )
}
