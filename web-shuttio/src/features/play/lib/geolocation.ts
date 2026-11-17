export type GeoFix = { lat: number; lng: number; accuracy: number }

/** Why a position couldn't be read — each maps to its own message. */
export type GeoFailure = "unsupported" | "denied" | "unavailable"

/**
 * One high-accuracy position read from the browser. Rejects with a
 * {@link GeoFailure} so callers can tell "no permission" from "no signal".
 */
export function currentPosition(): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject("unsupported" satisfies GeoFailure)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: Math.round(pos.coords.latitude * 1e6) / 1e6,
          lng: Math.round(pos.coords.longitude * 1e6) / 1e6,
          accuracy: Math.round(pos.coords.accuracy),
        }),
      (err) =>
        reject(
          (err.code === err.PERMISSION_DENIED
            ? "denied"
            : "unavailable") satisfies GeoFailure
        ),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 }
    )
  })
}
