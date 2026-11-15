import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { Building2, Loader2, MapPin } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  placeSearchEnabled,
  searchPlaces,
} from "@/features/play/lib/place-search"
import type { PlaceHit } from "@/features/play/lib/place-search"
import { m } from "@/paraglide/messages"

/** Typing pauses this long before a search is sent. */
const DEBOUNCE_MS = 350
const MIN_CHARS = 3

/** The slice of a TanStack Form field this input needs. */
export interface PlaceFieldApi {
  name: string
  state: {
    value: string
    meta: {
      isTouched: boolean
      isValid: boolean
      errors: Array<{ message?: string } | undefined>
    }
  }
  handleBlur: () => void
  handleChange: (value: string) => void
}

/**
 * A text field for a self-booked court's name or address that suggests real
 * places as the host types. Picking one hands the place to `onPick`, which
 * fills the name, address, area and map pin in one go — the host then only
 * checks the pin. Without a Mapbox token it is a plain text field.
 */
export function PlaceSuggestField({
  field,
  label,
  placeholder,
  near,
  onPick,
  hint,
}: {
  field: PlaceFieldApi
  label: string
  placeholder?: string
  /** Bias results toward here (the current pin, else the city). */
  near: { lat: number; lng: number }
  onPick: (hit: PlaceHit) => void
  /** Shown under the field when place search is available. */
  hint?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [debounced, setDebounced] = React.useState("")
  const listId = React.useId()
  const value = field.state.value

  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value.trim()), DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [value])

  const enabled = placeSearchEnabled && open && debounced.length >= MIN_CHARS
  const {
    data: hits = [],
    isFetching,
    isError,
  } = useQuery({
    // Rounded so small pin nudges don't refetch.
    queryKey: [
      "place-search",
      debounced,
      near.lat.toFixed(2),
      near.lng.toFixed(2),
    ],
    queryFn: ({ signal }) => searchPlaces(debounced, near, signal),
    enabled,
    staleTime: 10 * 60_000,
  })

  const invalid = field.state.meta.isTouched && !field.state.meta.isValid
  const showList = enabled

  return (
    <Field data-invalid={invalid} className="relative">
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Input
        id={field.name}
        name={field.name}
        value={value}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false)
          field.handleBlur()
        }}
        onChange={(e) => {
          setOpen(true)
          field.handleChange(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false)
        }}
        aria-invalid={invalid}
        aria-autocomplete="list"
        aria-controls={showList ? listId : undefined}
        placeholder={placeholder}
        autoComplete="off"
      />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-2xl bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-border"
        >
          {isFetching && hits.length === 0 ? (
            <li className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {m.self_court_search_loading()}
            </li>
          ) : hits.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              {isError
                ? m.self_court_search_failed()
                : m.self_court_search_empty()}
            </li>
          ) : (
            hits.map((hit) => {
              const Icon = hit.kind === "poi" ? Building2 : MapPin
              return (
                <li key={hit.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    // Keep focus in the input so blur doesn't close the list
                    // before the click lands.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setOpen(false)
                      onPick(hit)
                    }}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left transition-colors",
                      "hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    )}
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {hit.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {hit.address}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      ) : null}
      {placeSearchEnabled && hint ? (
        <FieldDescription>{hint}</FieldDescription>
      ) : null}
      {invalid && <FieldError errors={field.state.meta.errors} />}
    </Field>
  )
}
