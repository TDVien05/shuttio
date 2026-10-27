import { useRouter } from "@tanstack/react-router"
import * as React from "react"
import { toast } from "sonner"
import { z } from "zod"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LocateFixed,
  MapPin,
  Plus,
  Store,
  Trash2,
} from "lucide-react"

import { useAppForm } from "@/components/form"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { normalizeVnPhone } from "@/lib/shared"
import type { SportKey } from "@/lib/shared"
import { useProvisionVenue } from "@/features/venue/api/venue.queries"
import {
  PayoutFields,
  payoutSchema,
} from "@/features/venue/components/payout-fields"
import {
  EMPTY_PAYOUT,
  isPayoutValid,
  normalizeAccountNo,
  toBankAccountName,
} from "@/lib/bank-account"
import type { PayoutDraft } from "@/lib/bank-account"
import { PROVINCE_OPTIONS, provinceCodeByName, wardsOf } from "@/lib/vn-admin"
import { m } from "@/paraglide/messages"

const stepsMessages = {
  brand: m.venue_setup_steps_brand,
  branches: m.venue_setup_steps_branches,
  review: m.venue_setup_steps_review,
} as const

const formLocationModeMessages = {
  current: m.venue_setup_form_location_mode_current,
  manual: m.venue_setup_form_location_mode_manual,
} as const

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/** Brand step: names, a reachable owner phone, and the payout account. */
const brandSchema = z.object({
  brandName: z.string().trim().min(2),
  managerName: z.string().trim().min(2),
  contactPhone: z.string().refine((value) => normalizeVnPhone(value) !== null),
  payout: payoutSchema,
})

/**
 * Branch draft: location, opening hours and a map pin (both coordinates).
 * Kept in sync with the API's provisioning DTO.
 */
const branchSchema = z
  .object({
    name: z.string().trim().min(2),
    ward: z.string().min(1),
    province: z.string().min(1),
    sports: z.custom<SportKey[]>(),
    openFrom: z.string().regex(TIME_RE),
    openTo: z.string().regex(TIME_RE),
    lat: z.number().optional(),
    lng: z.number().optional(),
  })
  .refine(
    (draft) => draft.lat !== undefined && draft.lng !== undefined,
    "A map pin is required"
  )

// Diacritics-insensitive lookup so "ho chi minh" matches "Hồ Chí Minh".
const foldVn = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()

const vnNameFilter = (itemValue: string, query: string) =>
  foldVn(itemValue).includes(foldVn(query))

/**
 * Single-select combobox over VN admin-unit names: type to search (accent
 * insensitive), the field shows the selected name.
 */
function AdminUnitCombobox({
  id,
  items,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  id: string
  items: string[]
  value: string
  onChange: (name: string) => void
  placeholder: string
  disabled?: boolean
}) {
  return (
    <Combobox
      aria-label={placeholder}
      defaultItems={items.map((name) => ({ id: name }))}
      value={value === "" ? null : value}
      onChange={(name) => onChange(typeof name === "string" ? name : "")}
      defaultFilter={vnNameFilter}
      isDisabled={disabled}
      className="w-full"
    >
      <ComboboxInput id={id} placeholder={placeholder} className="w-full" />
      <ComboboxContent>
        <ComboboxList
          renderEmptyState={() => (
            <ComboboxEmpty>{m.venue_setup_form_no_results()}</ComboboxEmpty>
          )}
        >
          {(item: { id: string }) => (
            <ComboboxItem id={item.id}>{item.id}</ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

interface VenueDraft {
  name: string
  ward: string
  province: string
  sports: SportKey[]
  openFrom: string
  openTo: string
  /** Map position (WGS84) — optional; set via geolocation or manual entry. */
  lat?: number
  lng?: number
}

interface BrandDraft {
  brandName: string
  managerName: string
  /** Owner contact phone — lets an admin reach the owner when needed. */
  contactPhone: string
  /** Where players transfer booking money. */
  payout: PayoutDraft
}

const EMPTY_DRAFT: VenueDraft = {
  name: "",
  ward: "",
  province: "",
  sports: ["badminton"],
  openFrom: "06:00",
  openTo: "22:00",
}

/**
 * Guided new-account setup: on first-time setup, collect the account's brand
 * (thương hiệu) first, then a LIST of branches (chi nhánh) — courts are added
 * afterwards on each branch's own "Sân" screen (plan 020), so a branch with no
 * courts yet is a valid draft. Provisioning both also seeds the player
 * profile. Adding another branch (`?branch=1`, `addingBranch`) skips the
 * brand step — the account's brand and manager already exist and are reused
 * server-side. Lives outside the dashboard layout so it can run before any
 * venue exists.
 */
export function SetupWizard({
  addingBranch,
  exitHref,
}: {
  addingBranch: boolean
  /** Where "Back" on the first step leaves the wizard to. */
  exitHref: string
}) {
  const router = useRouter()
  const provision = useProvisionVenue()

  const [step, setStep] = React.useState(0)
  const submitting = provision.isPending
  const [brand, setBrand] = React.useState<BrandDraft>({
    brandName: "",
    managerName: "",
    contactPhone: "",
    payout: EMPTY_PAYOUT,
  })
  const [branches, setBranches] = React.useState<VenueDraft[]>([])
  const [draft, setDraft] = React.useState<VenueDraft>(EMPTY_DRAFT)

  const contactPhone = normalizeVnPhone(brand.contactPhone)
  const brandValid =
    brand.brandName.trim().length >= 2 &&
    brand.managerName.trim().length >= 2 &&
    contactPhone !== null &&
    isPayoutValid(brand.payout)

  // A branch must have a map pin — both coordinates present and in valid WGS84
  // range (set via current-location or manual entry).
  const draftCoordsValid =
    draft.lat !== undefined &&
    draft.lng !== undefined &&
    draft.lat >= -90 &&
    draft.lat <= 90 &&
    draft.lng >= -180 &&
    draft.lng <= 180

  const draftValid =
    draft.name.trim().length >= 2 &&
    draft.ward.trim().length >= 1 &&
    draft.province.trim().length >= 1 &&
    TIME_RE.test(draft.openFrom) &&
    TIME_RE.test(draft.openTo) &&
    draftCoordsValid

  const addBranch = () => {
    if (!draftValid) return
    setBranches((b) => [...b, { ...draft, name: draft.name.trim() }])
    setDraft(EMPTY_DRAFT)
  }
  const removeBranch = (i: number) =>
    setBranches((b) => b.filter((_, idx) => idx !== i))

  const submit = async () => {
    try {
      const payload = addingBranch
        ? { branches }
        : {
            brandName: brand.brandName,
            managerName: brand.managerName,
            contactPhone: contactPhone ?? undefined,
            payout: {
              bankBin: brand.payout.bankBin,
              accountNo: normalizeAccountNo(brand.payout.accountNo),
              accountName: toBankAccountName(brand.payout.accountName),
            },
            branches,
          }
      const venueId = await provision.mutateAsync(payload)
      toast.success(m.venue_setup_toast_done({ name: branches[0]?.name ?? "" }))
      void router.navigate({ href: `/app/venue/${venueId}`, replace: true })
    } catch (e) {
      toast.error(m.venue_setup_error(), {
        description: e instanceof Error ? e.message : undefined,
      })
    }
  }

  const stepKinds = addingBranch
    ? (["branches", "review"] as const)
    : (["brand", "branches", "review"] as const)
  const steps = stepKinds.map((k) => stepsMessages[k]())
  const currentKind = stepKinds[step]
  const canAdvance =
    currentKind === "brand"
      ? brandValid
      : currentKind === "branches"
        ? branches.length > 0
        : true

  return (
    <div className="w-full max-w-lg">
      <div className="mb-6 flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-2xl bg-brand/12 text-brand">
          <Store className="size-5" />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            {m.venue_setup_title()}
          </h1>
          <p className="text-sm text-muted-foreground">
            {m.venue_setup_subtitle()}
          </p>
        </div>
      </div>

      <ol className="mb-6 flex items-center gap-2">
        {steps.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                i < step && "bg-brand text-brand-foreground",
                i === step && "bg-brand/15 text-brand ring-1 ring-brand",
                i > step && "bg-muted text-muted-foreground"
              )}
            >
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span
              className={cn(
                "truncate text-xs font-medium",
                i === step ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>

      <div className="rounded-3xl bg-card p-5 ring-1 ring-foreground/5 dark:ring-foreground/10">
        {currentKind === "brand" ? (
          <BrandStep brand={brand} setBrand={setBrand} />
        ) : currentKind === "branches" ? (
          <BranchesStep
            draft={draft}
            setDraft={setDraft}
            draftValid={draftValid}
            branches={branches}
            onAdd={addBranch}
            onRemove={removeBranch}
          />
        ) : (
          <ReviewStep
            branches={branches}
            brandName={addingBranch ? undefined : brand.brandName}
            contactPhone={
              addingBranch ? undefined : (contactPhone ?? undefined)
            }
          />
        )}
      </div>

      <div className="mt-5 flex items-center justify-between gap-2">
        <Button
          shape="pill"
          type="button"
          variant="ghost"

          isDisabled={submitting}
          onPress={() =>
            step === 0
              ? void router.navigate({ href: exitHref })
              : setStep((s) => s - 1)
          }
        >
          <ArrowLeft />
          {m.venue_setup_back()}
        </Button>
        {step < steps.length - 1 ? (
          <Button
            shape="pill"
            type="button"

            isDisabled={!canAdvance}
            onPress={() => setStep((s) => s + 1)}
          >
            {m.venue_setup_next()}
            <ArrowRight />
          </Button>
        ) : (
          <Button
            shape="pill"
            type="button"

            isDisabled={submitting || branches.length === 0}
            onPress={() => void submit()}
          >
            {submitting ? m.venue_setup_creating() : m.venue_setup_finish()}
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Step 0 (first-time only): brand profile ───────────────────────────────────

function BrandStep({
  brand,
  setBrand,
}: {
  brand: BrandDraft
  setBrand: React.Dispatch<React.SetStateAction<BrandDraft>>
}) {
  // The wizard owns the draft across steps; this form validates the step and
  // mirrors every change back so "Next" stays in sync.
  const form = useAppForm({
    defaultValues: brand,
    validators: { onChange: brandSchema, onMount: brandSchema },
    listeners: {
      onChange: ({ formApi }) => setBrand(formApi.state.values),
    },
  })

  return (
    <div className="flex flex-col gap-5">
      <form.Field name="brandName">
        {(field) => (
          <Field>
            <FieldLabel htmlFor="b-name">
              {m.venue_setup_form_brand_name()}
            </FieldLabel>
            <Input
              id="b-name"
              value={field.state.value}
              autoComplete="off"
              placeholder={m.venue_setup_form_brand_name_placeholder()}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
          </Field>
        )}
      </form.Field>
      <form.Field name="managerName">
        {(field) => (
          <Field>
            <FieldLabel htmlFor="b-mgr">
              {m.venue_setup_form_manager()}
            </FieldLabel>
            <Input
              id="b-mgr"
              value={field.state.value}
              autoComplete="off"
              placeholder={m.venue_setup_form_manager_placeholder()}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
          </Field>
        )}
      </form.Field>
      <form.Field name="contactPhone">
        {(field) => {
          // Only flag the number once the owner has typed something that can't
          // be a valid phone — an empty field just keeps "Next" disabled.
          const phoneInvalid =
            field.state.value.trim() !== "" &&
            normalizeVnPhone(field.state.value) === null
          return (
            <Field data-invalid={phoneInvalid || undefined}>
              <FieldLabel htmlFor="b-phone">
                {m.venue_setup_form_contact_phone()}
              </FieldLabel>
              <Input
                id="b-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={field.state.value}
                aria-invalid={phoneInvalid || undefined}
                placeholder={m.venue_setup_form_contact_phone_placeholder()}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
              {phoneInvalid ? (
                <FieldError>
                  {m.venue_setup_form_contact_phone_invalid()}
                </FieldError>
              ) : (
                <FieldDescription>
                  {m.venue_setup_form_contact_phone_hint()}
                </FieldDescription>
              )}
            </Field>
          )
        }}
      </form.Field>
      <div className="flex flex-col gap-1.5 border-t pt-5">
        <h3 className="font-heading font-semibold">
          {m.venue_setup_form_payout_title()}
        </h3>
        <p className="mb-2 text-sm text-muted-foreground">
          {m.venue_setup_form_payout_hint()}
        </p>
        <form.Field name="payout">
          {(field) => (
            <PayoutFields
              value={field.state.value}
              onChange={field.handleChange}
              idPrefix="setup-payout"
            />
          )}
        </form.Field>
      </div>
    </div>
  )
}

// ── Step 1: branches (chi nhánh) — add one at a time, courts come later ──────

function BranchesStep({
  draft,
  setDraft,
  draftValid,
  branches,
  onAdd,
  onRemove,
}: {
  draft: VenueDraft
  setDraft: React.Dispatch<React.SetStateAction<VenueDraft>>
  draftValid: boolean
  branches: VenueDraft[]
  onAdd: () => void
  onRemove: (i: number) => void
}) {
  // The wizard owns the draft; this step's form validates it and mirrors each
  // change back so "Add branch"/"Next" stay in sync.
  const form = useAppForm({
    defaultValues: draft,
    validators: { onChange: branchSchema, onMount: branchSchema },
    listeners: {
      onChange: ({ formApi }) => setDraft(formApi.state.values),
    },
  })

  const handleAdd = () => {
    if (!draftValid) return
    onAdd()
    // form.reset() updates the form store without emitting onChange, so mirror
    // the reset into the wizard-owned draft explicitly.
    form.reset(EMPTY_DRAFT)
    setDraft(EMPTY_DRAFT)
  }

  const provinceNames = React.useMemo(
    () => PROVINCE_OPTIONS.map((p) => p.name),
    []
  )
  const wardNames = React.useMemo(
    () => wardsOf(provinceCodeByName(draft.province)).map((w) => w.name),
    [draft.province]
  )
  const [locating, setLocating] = React.useState(false)
  // The two location methods are mutually exclusive — pick current-location OR
  // manual coordinates, never both at once.
  const [locMode, setLocMode] = React.useState<"current" | "manual">("current")

  // "" → undefined so an empty field clears the coordinate rather than sending 0.
  const parseCoord = (raw: string): number | undefined => {
    const v = raw.trim()
    if (v === "") return undefined
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }

  // Switching method starts that method fresh — drop whatever coordinate the
  // other one set so the pin has exactly one source.
  const switchLocMode = (mode: "current" | "manual") => {
    if (mode === locMode) return
    setLocMode(mode)
    form.setFieldValue("lat", undefined)
    form.setFieldValue("lng", undefined)
  }

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      toast.error(m.venue_setup_form_geo_unsupported())
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const round = (n: number) => Math.round(n * 1e6) / 1e6
        form.setFieldValue("lat", round(pos.coords.latitude))
        form.setFieldValue("lng", round(pos.coords.longitude))
        setLocating(false)
      },
      () => {
        setLocating(false)
        toast.error(m.venue_setup_form_geo_error())
      },
      { timeout: 15_000, maximumAge: 60_000 }
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {branches.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border">
          {branches.map((b, i) => (
            <li key={i} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{b.name}</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {b.ward} · {b.province} · {b.openFrom}–{b.openTo}
                </div>
              </div>
              <Button
                shape="pill"
                size="icon-sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                aria-label={m.venue_setup_remove_branch()}
                onPress={() => onRemove(i)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
          {m.venue_setup_no_branches_yet()}
        </p>
      )}

      <div className="flex flex-col gap-5 rounded-2xl bg-muted/40 p-3">
        <form.Field name="name">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="v-name">
                {m.venue_setup_form_name()}
              </FieldLabel>
              <Input
                id="v-name"
                value={field.state.value}
                autoComplete="off"
                placeholder={m.venue_setup_form_name_placeholder()}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
            </Field>
          )}
        </form.Field>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <form.Field name="province">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="v-province">
                  {m.venue_setup_form_province()}
                </FieldLabel>
                <AdminUnitCombobox
                  id="v-province"
                  items={provinceNames}
                  value={field.state.value}
                  placeholder={m.venue_setup_form_province_placeholder()}
                  onChange={(name) => {
                    field.handleChange(name)
                    form.setFieldValue("ward", "")
                  }}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="ward">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="v-ward">
                  {m.venue_setup_form_ward()}
                </FieldLabel>
                <AdminUnitCombobox
                  id="v-ward"
                  items={wardNames}
                  value={field.state.value}
                  placeholder={m.venue_setup_form_ward_placeholder()}
                  onChange={field.handleChange}
                  disabled={wardNames.length === 0}
                />
              </Field>
            )}
          </form.Field>
        </div>
        <Field>
          <FieldLabel>{m.venue_setup_form_location()}</FieldLabel>
          <p className="-mt-1 text-xs text-muted-foreground">
            {m.venue_setup_form_location_hint()}
          </p>
          {/* Pick ONE method — current-location or manual coordinates. Switching
              clears any coordinate the other method set, so there's a single
              source of truth for the pin. */}
          <div
            role="radiogroup"
            aria-label={m.venue_setup_form_location()}
            className="flex w-fit items-center gap-0.5 rounded-full bg-muted/60 p-0.5"
          >
            {(["current", "manual"] as const).map((mode) => {
              const active = locMode === mode
              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => switchLocMode(mode)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                    active
                      ? "bg-card text-foreground shadow-sm ring-1 ring-foreground/5"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {formLocationModeMessages[mode]()}
                </button>
              )
            })}
          </div>
          {locMode === "current" ? (
            <div className="flex flex-col gap-2">
              <Button
                shape="pill"
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                isDisabled={locating}
                onPress={useMyLocation}
              >
                <LocateFixed />
                {locating
                  ? m.venue_setup_form_locating()
                  : m.venue_setup_form_use_current_location()}
              </Button>
              {/* Keep the coordinate fields registered so the form's onChange
                  listener fires when the geolocation callback sets them. */}
              <form.Field name="lat">{() => null}</form.Field>
              <form.Field name="lng">{() => null}</form.Field>
              {draft.lat !== undefined && draft.lng !== undefined ? (
                <p className="flex items-center gap-1 text-xs text-brand">
                  <MapPin className="size-3.5" />
                  {m.venue_setup_form_coords_set()} · {draft.lat}, {draft.lng}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <form.Field name="lat">
                {(field) => (
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel htmlFor="v-lat">
                      {m.venue_setup_form_latitude()}
                    </FieldLabel>
                    <Input
                      id="v-lat"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      value={field.state.value ?? ""}
                      placeholder={m.venue_setup_form_latitude_placeholder()}
                      onChange={(e) =>
                        field.handleChange(parseCoord(e.target.value))
                      }
                      onBlur={field.handleBlur}
                    />
                  </div>
                )}
              </form.Field>
              <form.Field name="lng">
                {(field) => (
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel htmlFor="v-lng">
                      {m.venue_setup_form_longitude()}
                    </FieldLabel>
                    <Input
                      id="v-lng"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      value={field.state.value ?? ""}
                      placeholder={m.venue_setup_form_longitude_placeholder()}
                      onChange={(e) =>
                        field.handleChange(parseCoord(e.target.value))
                      }
                      onBlur={field.handleBlur}
                    />
                  </div>
                )}
              </form.Field>
            </div>
          )}
        </Field>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <form.Field name="openFrom">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="v-from">
                  {m.venue_setup_form_open_from()}
                </FieldLabel>
                <Input
                  id="v-from"
                  type="time"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="openTo">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="v-to">
                  {m.venue_setup_form_open_to()}
                </FieldLabel>
                <Input
                  id="v-to"
                  type="time"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              </Field>
            )}
          </form.Field>
        </div>
        <Button
          shape="pill"
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          isDisabled={!draftValid}
          onPress={handleAdd}
        >
          <Plus />
          {m.venue_setup_add_branch()}
        </Button>
      </div>
    </div>
  )
}

// ── Step 2: review ────────────────────────────────────────────────────────────

function ReviewStep({
  branches,
  brandName,
  contactPhone,
}: {
  branches: VenueDraft[]
  brandName?: string
  contactPhone?: string
}) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      {brandName ? (
        <div className="text-xs font-semibold text-muted-foreground uppercase">
          {brandName}
        </div>
      ) : null}
      {contactPhone ? (
        <div className="text-muted-foreground">
          {m.venue_setup_review_contact_phone({ phone: contactPhone })}
        </div>
      ) : null}
      <div>
        <div className="mb-1 text-xs font-semibold text-muted-foreground uppercase">
          {m.venue_setup_review_branches({ count: branches.length })}
        </div>
        <ul className="flex flex-col divide-y divide-border">
          {branches.map((b, i) => (
            <li key={i} className="py-2.5">
              <div className="flex items-center gap-2">
                <span className="font-heading font-bold">{b.name}</span>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <span>
                  {b.ward} · {b.province} · {b.openFrom}–{b.openTo}
                </span>
                {b.lat !== undefined && b.lng !== undefined ? (
                  <MapPin className="size-3 shrink-0 text-brand" />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">
        {m.venue_setup_review_note()}
      </p>
    </div>
  )
}
