import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { CheckCircle2, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  EMPTY_PAYOUT,
  isPayoutValid,
  normalizeAccountNo,
  toBankAccountName,
} from "@/lib/bank-account"
import type { PayoutDraft } from "@/lib/bank-account"
import type { BankInfo } from "@/lib/shared"
import {
  listBanks,
  lookupBankAccount,
  savePayout,
} from "@/features/venue/venue-api"
import { m } from "@/paraglide/messages"

type LookupState = "idle" | "loading" | "verified" | "failed"

/**
 * The bank list for the picker (cached for the session). `error` is set when
 * VietQR's list couldn't be fetched, so the form can say so rather than
 * showing an empty dropdown.
 */
export function useBanks(): { banks: BankInfo[] | undefined; error: boolean } {
  const { data: banks, isError } = useQuery({
    queryKey: ["banks"],
    queryFn: listBanks,
    staleTime: Infinity,
  })
  return { banks, error: isError }
}

/**
 * Bank + account number + holder name: where players transfer a booking's
 * money. Shared by the setup wizard (brand step) and the manage screen.
 */
export function PayoutFields({
  value,
  onChange,
  idPrefix = "payout",
}: {
  value: PayoutDraft
  onChange: (next: PayoutDraft) => void
  idPrefix?: string
}) {
  const { banks, error } = useBanks()
  const bank = banks?.find((b) => b.bin === value.bankBin)
  const nameInvalid =
    value.accountName.trim() !== "" &&
    !/^[A-Z ]{2,60}$/.test(toBankAccountName(value.accountName))
  const noInvalid =
    value.accountNo.trim() !== "" &&
    !/^\d{6,20}$/.test(normalizeAccountNo(value.accountNo))

  const [lookupState, setLookupState] = React.useState<LookupState>("idle")

  const normNo = normalizeAccountNo(value.accountNo)
  const validPair = /^\d{6}$/.test(value.bankBin) && /^\d{6,20}$/.test(normNo)
  const pairKey = validPair ? `${value.bankBin}:${normNo}` : ""

  React.useEffect(() => {
    if (!pairKey) {
      setLookupState("idle")
      return
    }
    setLookupState("loading")
    const bin = value.bankBin
    const no = normNo
    const id = setTimeout(() => {
      lookupBankAccount(bin, no)
        .then((name) => {
          if (name) {
            onChange({ ...value, accountName: toBankAccountName(name) })
            setLookupState("verified")
          } else {
            setLookupState("failed")
          }
        })
        .catch(() => setLookupState("failed"))
    }, 600)
    return () => clearTimeout(id)
    // Only re-run when the bank/account pair changes, not on every value change.
  }, [pairKey])

  return (
    <div className="flex flex-col gap-5">
      <Field>
        <Select
          className="flex w-full flex-col gap-2"
          placeholder={m.venue_payout_bank_placeholder()}
          value={value.bankBin || null}
          onChange={(v) => {
            if (typeof v === "string") onChange({ ...value, bankBin: v })
          }}
        >
          <FieldLabel>{m.venue_payout_bank()}</FieldLabel>
          <SelectTrigger id={`${idPrefix}-bank`} className="w-full">
            <SelectValue>
              {bank ? `${bank.shortName} — ${bank.name}` : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {(banks ?? []).map((b) => (
              <SelectItem key={b.bin} id={b.bin}>
                {b.shortName} — {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error ? <FieldError>{m.venue_payout_banks_error()}</FieldError> : null}
      </Field>
      <Field data-invalid={noInvalid || undefined}>
        <FieldLabel htmlFor={`${idPrefix}-no`}>
          {m.venue_payout_account_no()}
        </FieldLabel>
        <Input
          id={`${idPrefix}-no`}
          inputMode="numeric"
          autoComplete="off"
          value={value.accountNo}
          aria-invalid={noInvalid || undefined}
          placeholder={m.venue_payout_account_no_placeholder()}
          onChange={(e) =>
            onChange({
              ...value,
              accountNo: e.target.value.replace(/[^\d ]/g, ""),
            })
          }
        />
        {noInvalid ? (
          <FieldError>{m.venue_payout_account_no_invalid()}</FieldError>
        ) : null}
      </Field>
      <Field data-invalid={nameInvalid || undefined}>
        <FieldLabel htmlFor={`${idPrefix}-name`}>
          {m.venue_payout_account_name()}
        </FieldLabel>
        <div className="relative">
          <Input
            id={`${idPrefix}-name`}
            autoComplete="off"
            readOnly={lookupState === "loading"}
            value={value.accountName}
            aria-invalid={nameInvalid || undefined}
            placeholder={
              lookupState === "loading"
                ? m.venue_payout_lookup_pending()
                : m.venue_payout_account_name_placeholder()
            }
            className={lookupState === "loading" ? "pr-9 opacity-60" : "pr-9"}
            onChange={(e) => {
              if (lookupState === "verified") setLookupState("idle")
              onChange({ ...value, accountName: e.target.value })
            }}
          />
          {lookupState === "loading" && (
            <Loader2 className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
          {lookupState === "verified" && (
            <CheckCircle2 className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-green-500" />
          )}
        </div>
        {nameInvalid ? (
          <FieldError>{m.venue_payout_account_name_invalid()}</FieldError>
        ) : lookupState === "verified" ? (
          <FieldDescription className="text-green-600 dark:text-green-400">
            {m.venue_payout_lookup_verified()}
          </FieldDescription>
        ) : lookupState === "failed" ? (
          <FieldDescription>{m.venue_payout_lookup_failed()}</FieldDescription>
        ) : (
          <FieldDescription>
            {m.venue_payout_account_name_hint()}
          </FieldDescription>
        )}
      </Field>
    </div>
  )
}

/** The manage-screen editor: shows the saved account and lets the owner change it. */
export function PayoutEditor({ initial }: { initial: PayoutDraft | null }) {
  const [draft, setDraft] = React.useState<PayoutDraft>(initial ?? EMPTY_PAYOUT)
  const [saving, setSaving] = React.useState(false)
  const valid = isPayoutValid(draft)

  const save = async () => {
    if (!valid || saving) return
    setSaving(true)
    const result = await savePayout({
      bankBin: draft.bankBin,
      accountNo: normalizeAccountNo(draft.accountNo),
      accountName: toBankAccountName(draft.accountName),
    })
    setSaving(false)
    if (result.ok) toast.success(m.venue_payout_saved())
    else toast.error(result.message)
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{m.venue_payout_notice()}</p>
      <PayoutFields
        value={draft}
        onChange={setDraft}
        idPrefix="manage-payout"
      />
      <Button
        className="self-start rounded-full"
        isDisabled={!valid || saving}
        onPress={() => void save()}
      >
        {m.venue_payout_save()}
      </Button>
    </div>
  )
}
