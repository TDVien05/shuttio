import * as React from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
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
import { createConversation } from "@/features/chat/api/chat-api"
import type { FoundUser } from "@/features/chat/api/chat-api"
import { UserPicker } from "@/features/chat/components/user-picker"
import { m } from "@/paraglide/messages"

/** Start a DM (one person picked) or a named group (two or more). */
export function NewChatDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (channelId: string) => void
}) {
  return (
    <Dialog isOpen={open} onOpenChange={onOpenChange}>
      {/* Mounted only while open so each opening starts from a clean search. */}
      {open && (
        <NewChatForm
          onCancel={() => onOpenChange(false)}
          onCreated={(id) => {
            onOpenChange(false)
            onCreated(id)
          }}
        />
      )}
    </Dialog>
  )
}

function NewChatForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: (channelId: string) => void
}) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = React.useState<FoundUser[]>([])
  const [name, setName] = React.useState("")

  const isGroup = selected.length > 1
  const create = useMutation({
    mutationFn: () =>
      createConversation({
        memberIds: selected.map((u) => u.id),
        ...(isGroup ? { name: name.trim() } : {}),
      }),
    onSuccess: ({ id }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.chat.all() })
      onCreated(id)
    },
    onError: () => toast.error(m.chat_create_failed()),
  })

  const toggle = (user: FoundUser) =>
    setSelected((prev) =>
      prev.some((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user]
    )
  const canCreate = selected.length > 0 && (!isGroup || name.trim().length > 0)

  return (
    <>
      <DialogHeader>
        <DialogTitle>{m.chat_new_chat()}</DialogTitle>
        <DialogDescription>{m.chat_new_chat_hint()}</DialogDescription>
      </DialogHeader>
      <UserPicker selected={selected} onToggle={toggle} />
      {isGroup && (
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={m.chat_group_name_placeholder()}
          aria-label={m.chat_group_name_placeholder()}
          maxLength={80}
        />
      )}
      <DialogFooter>
        <Button variant="outline" onPress={onCancel}>
          {m.chat_cancel()}
        </Button>
        <Button
          isDisabled={!canCreate || create.isPending}
          onPress={() => create.mutate()}
        >
          {create.isPending ? m.chat_creating() : m.chat_create()}
        </Button>
      </DialogFooter>
    </>
  )
}
