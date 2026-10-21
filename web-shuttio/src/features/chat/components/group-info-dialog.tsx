import * as React from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
import { toast } from "sonner"

import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { leaveConversation } from "@/features/chat/api/chat-api"
import type { FoundUser } from "@/features/chat/api/chat-api"
import {
  addGroupMembers,
  deleteGroup,
  renameGroup,
} from "@/features/chat/api/group-api"
import { UserAvatar } from "@/features/chat/components/user-avatar"
import { UserPicker } from "@/features/chat/components/user-picker"
import type { ChatChannel } from "@/lib/shared"
import { m } from "@/paraglide/messages"

/** Group / room details: rename, members, add people, leave or delete. */
export function GroupInfoDialog({
  channel,
  userId,
  open,
  onOpenChange,
  onGone,
}: {
  channel: ChatChannel
  userId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The conversation left the caller's list (left or deleted). */
  onGone: () => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = React.useState(channel.name ?? "")
  const [adding, setAdding] = React.useState<FoundUser[]>([])

  const isGroup = channel.kind === "group"
  const isCreator = channel.createdBy === userId
  const onlyMember = channel.members.length === 1
  const canDelete =
    (isGroup && (isCreator || onlyMember)) || (!isGroup && onlyMember)

  const done = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.chat.all() })
  const failed = () => toast.error(m.chat_group_update_failed())
  const rename = useMutation({
    mutationFn: () => renameGroup(channel.id, name.trim()),
    onSuccess: done,
    onError: failed,
  })
  const add = useMutation({
    mutationFn: () =>
      addGroupMembers(
        channel.id,
        adding.map((u) => u.id)
      ),
    onSuccess: () => {
      setAdding([])
      done()
    },
    onError: failed,
  })
  const leave = useMutation({
    mutationFn: () => leaveConversation(channel.id),
    onSuccess: () => {
      done()
      onGone()
    },
    onError: failed,
  })
  const remove = useMutation({
    mutationFn: () => deleteGroup(channel.id),
    onSuccess: () => {
      done()
      onGone()
    },
    onError: failed,
  })

  const toggleAdding = (user: FoundUser) =>
    setAdding((prev) =>
      prev.some((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user]
    )

  return (
    <Dialog
      isOpen={open}
      onOpenChange={onOpenChange}
      className="max-h-vh-88 overflow-y-auto"
    >
      <DialogHeader>
        <DialogTitle>{m.chat_group_info()}</DialogTitle>
      </DialogHeader>

      {isGroup && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) rename.mutate()
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label={m.chat_group_name_placeholder()}
            maxLength={80}
          />
          <Button
            type="submit"
            isDisabled={
              !name.trim() || name.trim() === channel.name || rename.isPending
            }
          >
            {m.chat_group_save()}
          </Button>
        </form>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">
          {m.chat_members({ count: channel.members.length })}
        </h3>
        <ul className="flex flex-col gap-2">
          {channel.members.map((member) => (
            <li key={member.id} className="flex items-center gap-3">
              <UserAvatar name={member.name} image={member.image} />
              <span className="truncate">{member.name}</span>
            </li>
          ))}
        </ul>
      </section>

      {isGroup && isCreator && (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">{m.chat_group_add_members()}</h3>
          <UserPicker
            selected={adding}
            excludeIds={channel.members.map((member) => member.id)}
            onToggle={toggleAdding}
          />
          <Button
            isDisabled={adding.length === 0 || add.isPending}
            onPress={() => add.mutate()}
          >
            {m.chat_group_add()}
          </Button>
        </section>
      )}

      <div className="flex flex-col gap-2">
        {isGroup && (
          <AlertDialogTrigger>
            <Button variant="destructive">{m.chat_leave_group()}</Button>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {m.chat_leave_group_title()}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {m.chat_leave_group_description({
                    name: channel.name ?? "",
                  })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{m.chat_cancel()}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onPress={() => leave.mutate()}
                >
                  {leave.isPending ? m.chat_leaving() : m.chat_leave_group()}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialogTrigger>
        )}
        {canDelete && (
          <AlertDialogTrigger>
            <Button variant="danger">{m.chat_delete_group()}</Button>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {m.chat_delete_group_title()}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {m.chat_delete_group_description({
                    name: channel.name ?? "",
                  })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{m.chat_cancel()}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onPress={() => remove.mutate()}
                >
                  {remove.isPending ? m.chat_deleting() : m.chat_delete_group()}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialogTrigger>
        )}
      </div>
    </Dialog>
  )
}
