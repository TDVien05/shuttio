import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useAdminActions } from "@/features/admin/api/admin-api"
import { m } from "@/paraglide/messages"

/** Admin creates a venue-operator account; the password is emailed to them. */
export function CreateVenueAccountDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const admin = useAdminActions()
  const [email, setEmail] = React.useState("")
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    const result = await admin.createVenueAccount({
      email: email.trim(),
      name: name.trim() || undefined,
    })
    setBusy(false)
    if (result.ok) {
      toast.success(m.admin_venues_create_account_done({ email: email.trim() }))
      setEmail("")
      setName("")
      onClose()
    } else {
      toast.error(result.message)
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => !open && !busy && onClose()}
      className="sm:max-w-md"
    >
      <DialogHeader>
        <DialogTitle>{m.admin_venues_create_account_title()}</DialogTitle>
        <DialogDescription>
          {m.admin_venues_create_account_body()}
        </DialogDescription>
      </DialogHeader>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {m.admin_venues_create_account_email()}
          <Input
            required
            disabled={busy}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {m.admin_venues_create_account_name()}
          <Input
            value={name}
            maxLength={80}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <DialogFooter>
          <Button variant="outline" isDisabled={busy} onPress={onClose}>
            {m.admin_venues_create_account_cancel()}
          </Button>
          <Button type="submit" isDisabled={busy || !email.trim()}>
            {busy ? <Spinner className="size-4 text-current" /> : null}
            {busy
              ? m.admin_venues_create_account_submitting()
              : m.admin_venues_create_account_submit()}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
