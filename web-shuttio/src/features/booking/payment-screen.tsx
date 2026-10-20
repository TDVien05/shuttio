import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import * as React from "react"
import {
  Check,
  Copy,
  ImagePlus,
  Loader2,
  MessageCircle,
  Phone,
  TriangleAlert,
} from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import { useAppForm } from "@/components/form"
import { cn } from "@/lib/utils"
import { Button, LinkButton } from "@/components/ui/button"
import {
  EMPTY_PAYOUT,
  isPayoutValid,
  normalizeAccountNo,
  toBankAccountName,
} from "@/lib/bank-account"
import type { PayoutDraft } from "@/lib/bank-account"
import {
  IMAGE_ACCEPT,
  IMAGE_MAX_BYTES,
  uploadToCloudinary,
} from "@/lib/cloudinary-upload"
import { formatVndFull, slotRange } from "@/lib/shared"
import {
  signPaymentProofUpload,
  startVietQrPayment,
  submitPaymentProof,
} from "@/features/play/payment-api"
import type { VietQrPayment } from "@/features/play/payment-api"
import { PayoutFields } from "@/features/venue/payout-fields"
import { useData } from "@/features/dashboard/data-provider"
import { savePlayerPhone } from "@/features/dashboard/profile-api"
import { m } from "@/paraglide/messages"

type Screen =
  | { kind: "loading" }
  | { kind: "ready"; pay: VietQrPayment }
  | { kind: "error"; message: string }
  | { kind: "sent"; venueId: string | null }

const CARD =
  "rounded-3xl border border-[#eaf0fc] bg-white p-5 shadow-[0_3px_16px_#14205006]"

/** One labelled value with a copy button — the transfer details the player re-types. */
function CopyRow({
  label,
  value,
  display,
}: {
  label: string
  value: string
  display?: string
}) {
  const [copied, setCopied] = React.useState(false)
  const copy = () => {
    void navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => toast.error(m.payment_viet_qr_copy_failed()))
  }
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#eaf0fc] py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-mono text-base font-semibold break-all text-[#0b1224]">
          {display ?? value}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0 rounded-full"
        onPress={copy}
        aria-label={`${m.payment_viet_qr_copy()} ${label}`}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? m.payment_viet_qr_copied() : m.payment_viet_qr_copy()}
      </Button>
    </div>
  )
}

/**
 * A full-screen gate asking for a phone number on first booking. Saves it via
 * server action, then tells the caller to proceed.
 */
const phoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(9, { error: () => m.payment_viet_qr_phone_error() }),
})

function PhoneGate({ onDone }: { onDone: () => void }) {
  const form = useAppForm({
    defaultValues: { phone: "" },
    validators: { onChange: phoneSchema },
    onSubmit: async ({ value }) => {
      try {
        await savePlayerPhone(value.phone.trim())
        onDone()
      } catch {
        toast.error(m.payment_viet_qr_submit_failed())
      }
    },
  })

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 px-4 py-16 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-brand/10 text-brand">
        <Phone className="size-7" />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-black">
          {m.payment_viet_qr_phone_title()}
        </h1>
        <p className="text-sm text-muted-foreground">
          {m.payment_viet_qr_phone_body()}
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
        className="flex w-full flex-col gap-3"
      >
        <form.Field name="phone">
          {(field) => (
            <input
              type="tel"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
              placeholder={m.payment_viet_qr_phone_placeholder()}
              aria-label={m.payment_viet_qr_phone_title()}
              autoFocus
              className="w-full rounded-full border border-input bg-background px-4 py-2.5 text-center text-base ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          )}
        </form.Field>
        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting] as const}
        >
          {([canSubmit, isSubmitting]) => (
            <Button
              type="submit"
              className="h-11 rounded-full text-base"
              isDisabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" />
                  {m.payment_viet_qr_phone_saving()}
                </>
              ) : (
                m.payment_viet_qr_phone_continue()
              )}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </div>
  )
}

/**
 * Pay a booking by bank transfer: the venue's QR + account + a unique memo, then
 * the player's own refund account and a screenshot of the transfer. The booking
 * is only sent to the venue when the screenshot is submitted.
 */
export function PaymentScreen({
  bookingId,
  discountCode,
}: {
  bookingId: string
  discountCode?: string
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { phone: savedPhone } = useData()
  const [phoneConfirmed, setPhoneConfirmed] = React.useState(!!savedPhone)
  const [screen, setScreen] = React.useState<Screen>({ kind: "loading" })
  const [refund, setRefund] = React.useState<PayoutDraft>(EMPTY_PAYOUT)
  const [file, setFile] = React.useState<File | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    let cancelled = false
    void startVietQrPayment(bookingId, discountCode).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setScreen({ kind: "error", message: result.message })
        return
      }
      const saved = result.data.refundAccount
      if (saved) {
        setRefund({
          bankBin: saved.bankBin,
          accountNo: saved.accountNo,
          accountName: saved.accountName,
        })
      }
      setScreen({ kind: "ready", pay: result.data })
    })
    return () => {
      cancelled = true
    }
  }, [bookingId, discountCode])

  // A blob URL derived from the chosen file, released when it is replaced.
  const preview = React.useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file]
  )
  React.useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview]
  )

  const onFile = (list: FileList | null) => {
    const picked = list?.[0]
    if (inputRef.current) inputRef.current.value = ""
    if (!picked) return
    if (!IMAGE_ACCEPT.split(",").includes(picked.type)) {
      toast.error(m.payment_viet_qr_file_type())
      return
    }
    if (picked.size > IMAGE_MAX_BYTES) {
      toast.error(
        m.payment_viet_qr_file_size({ mb: IMAGE_MAX_BYTES / 1024 / 1024 })
      )
      return
    }
    setFile(picked)
  }

  const canSubmit = isPayoutValid(refund) && file !== null && !submitting

  const submit = async () => {
    if (!file || !isPayoutValid(refund) || screen.kind !== "ready") return
    setSubmitting(true)
    try {
      const sig = await signPaymentProofUpload(bookingId)
      if (!sig.ok) {
        toast.error(sig.message)
        return
      }
      const proofUrl = await uploadToCloudinary(file, sig.data)
      const result = await submitPaymentProof(bookingId, {
        proofUrl,
        refundAccount: {
          bankBin: refund.bankBin,
          accountNo: normalizeAccountNo(refund.accountNo),
          accountName: toBankAccountName(refund.accountName),
        },
      })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      setScreen({ kind: "sent", venueId: screen.pay.venueId })
      void queryClient.invalidateQueries()
    } catch {
      toast.error(m.payment_viet_qr_submit_failed())
    } finally {
      setSubmitting(false)
    }
  }

  // Messaging isn't available yet — the chat page says so.
  const messageVenue = () => void router.navigate({ to: "/app/chat" })

  if (!phoneConfirmed) {
    return <PhoneGate onDone={() => setPhoneConfirmed(true)} />
  }

  if (screen.kind === "loading") {
    return (
      <div className="grid min-h-[50vh] place-items-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    )
  }

  if (screen.kind === "error") {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
        <TriangleAlert className="size-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{screen.message}</p>
        <LinkButton className="rounded-full" href="/app/bookings">
          {m.payment_viet_qr_to_bookings()}
        </LinkButton>
      </div>
    )
  }

  if (screen.kind === "sent") {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
        <div className="grid size-14 place-items-center rounded-full bg-brand/10 text-brand">
          <Check className="size-7" />
        </div>
        <h1 className="font-heading text-2xl font-black">
          {m.payment_viet_qr_sent_title()}
        </h1>
        <p className="text-sm text-muted-foreground">
          {m.payment_viet_qr_sent_body()}
        </p>
        <p className="rounded-2xl bg-[#f4f7fc] px-4 py-3 text-xs text-muted-foreground">
          {m.payment_viet_qr_sent_nudge()}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <LinkButton className="rounded-full" href="/app/bookings">
            {m.payment_viet_qr_to_bookings()}
          </LinkButton>
          {screen.venueId ? (
            <Button
              variant="outline"
              className="rounded-full"
              onPress={() => messageVenue()}
            >
              <MessageCircle className="size-4" />
              {m.payment_viet_qr_message_venue()}
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  const { pay } = screen
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-black tracking-tight sm:text-3xl">
          {m.payment_viet_qr_title()}
        </h1>
        <p className="text-xs text-muted-foreground">
          {pay.courtName} · {pay.dateKey} ·{" "}
          {slotRange(pay.start, pay.durationMin)}
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={cn(CARD, "flex flex-col gap-4")}>
          <h2 className="text-base font-semibold">
            {m.payment_viet_qr_step1()}
          </h2>
          <div className="mx-auto w-full max-w-[260px] rounded-2xl border border-[#eaf0fc] bg-white p-2">
            {/* The QR is VietQR's own image; it is not an asset we can optimise. */}
            <img
              src={pay.qrUrl}
              alt={m.payment_viet_qr_qr_alt()}
              className="h-auto w-full"
              width={260}
              height={260}
            />
          </div>
          <div className="flex flex-col">
            <CopyRow
              label={m.payment_viet_qr_bank()}
              value={pay.account.bankName}
            />
            <CopyRow
              label={m.payment_viet_qr_account_no()}
              value={pay.account.accountNo}
            />
            <CopyRow
              label={m.payment_viet_qr_account_name()}
              value={pay.account.accountName}
            />
            <CopyRow
              label={m.payment_viet_qr_amount()}
              value={String(pay.amount)}
              display={formatVndFull(pay.amount)}
            />
            <CopyRow
              label={m.payment_viet_qr_memo()}
              value={pay.transferMemo}
            />
          </div>
          {pay.discountCode ? (
            <p className="rounded-2xl bg-brand/8 px-3.5 py-2.5 text-xs text-brand">
              {m.payment_viet_qr_discount_applied({
                code: pay.discountCode,
                amount: formatVndFull(pay.discountAmount ?? 0),
              })}
            </p>
          ) : null}
          <p className="rounded-2xl bg-[#fff7e6] px-3.5 py-2.5 text-xs text-[#7a5200]">
            {m.payment_viet_qr_memo_warning()}
          </p>
        </section>

        <section className={cn(CARD, "flex flex-col gap-5")}>
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">
              {m.payment_viet_qr_step2()}
            </h2>
            <p className="text-xs text-muted-foreground">
              {m.payment_viet_qr_proof_hint()}
            </p>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            hidden
            onChange={(e) => onFile(e.target.files)}
          />
          {preview ? (
            <div className="flex flex-col items-start gap-2">
              {/* A local blob URL of the player's own screenshot. */}
              <img
                src={preview}
                alt={m.payment_viet_qr_proof_alt()}
                className="max-h-64 w-auto rounded-2xl border border-[#eaf0fc]"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onPress={() => inputRef.current?.click()}
              >
                {m.payment_viet_qr_change_image()}
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#c9d6f5] text-sm text-muted-foreground transition-colors hover:bg-[#f4f7fc]"
            >
              <ImagePlus className="size-6" />
              {m.payment_viet_qr_pick_image()}
            </button>
          )}

          <div className="flex flex-col gap-3 border-t border-[#eaf0fc] pt-5">
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold">
                {m.payment_viet_qr_refund_title()}
              </h3>
              <p className="text-xs text-muted-foreground">
                {m.payment_viet_qr_refund_hint()}
              </p>
            </div>
            <PayoutFields
              value={refund}
              onChange={setRefund}
              idPrefix="refund-account"
            />
          </div>

          <Button
            className="h-11 rounded-full text-base"
            isDisabled={!canSubmit}
            onPress={() => void submit()}
          >
            {submitting ? (
              <>
                <Loader2 className="animate-spin" />
                {m.payment_viet_qr_submitting()}
              </>
            ) : (
              m.payment_viet_qr_submit()
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {m.payment_viet_qr_venue_checks()}
          </p>
        </section>
      </div>
    </div>
  )
}
