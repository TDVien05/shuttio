import * as React from "react"
import { useMutation } from "@tanstack/react-query"
import { ImagePlus, Send, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { useAuthUser } from "@/features/dashboard/hooks/use-auth-user"
import { sendMessage, signChatImageUpload } from "@/features/chat/api/chat-api"
import {
  IMAGE_ACCEPT,
  IMAGE_MAX_BYTES,
  uploadPrivateToCloudinary,
} from "@/lib/cloudinary-upload"
import type { ChatMessage } from "@/lib/shared"
import { m } from "@/paraglide/messages"

interface SendVariables {
  text: string
  file: File | null
}

/** Text box + picture picker. Pictures upload privately, then ride the message. */
export function Composer({
  channelId,
  onSent,
  onOptimistic,
  onFailed,
}: {
  channelId: string
  onSent: (message: ChatMessage, tempId?: string) => void
  onOptimistic?: (message: ChatMessage) => void
  onFailed?: (tempId: string) => void
}) {
  const { id: userId } = useAuthUser()
  const [text, setText] = React.useState("")
  const [file, setFile] = React.useState<File | null>(null)
  const picker = React.useRef<HTMLInputElement>(null)

  // A preview URL for the chosen picture, revoked when it changes or goes.
  const previewUrl = React.useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file]
  )
  React.useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    },
    [previewUrl]
  )

  const send = useMutation<
    ChatMessage,
    Error,
    SendVariables,
    { tempId: string }
  >({
    onMutate: ({ text: content }) => {
      const tempId = `temp-${Date.now()}`
      onOptimistic?.({
        id: tempId,
        channelId,
        senderId: userId,
        text: content,
        createdAt: new Date().toISOString(),
        status: "sending",
      })
      setText("")
      setFile(null)
      return { tempId }
    },
    mutationFn: async ({ text: content, file: currentFile }) => {
      const image = currentFile
        ? await uploadPrivateToCloudinary(
            currentFile,
            await signChatImageUpload(channelId)
          )
        : undefined
      return sendMessage(channelId, { text: content, image })
    },
    onSuccess: (message, _vars, context) => {
      onSent(message, context.tempId)
    },
    onError: (_err, _vars, context) => {
      if (context) onFailed?.(context.tempId)
      toast.error(m.chat_send_failed())
    },
  })

  const canSend = (text.trim().length > 0 || file !== null) && !send.isPending

  const submit = () => {
    if (canSend) send.mutate({ text: text.trim(), file })
  }

  const pick = (chosen: File | undefined) => {
    if (!chosen) return
    if (!IMAGE_ACCEPT.split(",").includes(chosen.type)) {
      toast.error(m.chat_image_file_type())
    } else if (chosen.size > IMAGE_MAX_BYTES) {
      toast.error(m.chat_image_file_size({ mb: IMAGE_MAX_BYTES / 1024 / 1024 }))
    } else {
      setFile(chosen)
    }
    if (picker.current) picker.current.value = ""
  }

  return (
    <form
      className="flex flex-col gap-2 border-t p-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      {previewUrl && (
        <div className="relative w-fit">
          <img
            src={previewUrl}
            alt={m.chat_image_alt()}
            className="max-h-28 rounded-xl object-cover"
          />
          <Button
            size="icon-xs"
            shape="pill"
            variant="secondary"
            className="absolute -top-2 -right-2"
            aria-label={m.chat_remove_image()}
            isDisabled={send.isPending}
            onPress={() => setFile(null)}
          >
            <X />
          </Button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={picker}
          type="file"
          accept={IMAGE_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          shape="pill"
          aria-label={m.chat_attach_image()}
          isDisabled={send.isPending}
          onPress={() => picker.current?.click()}
        >
          <ImagePlus />
        </Button>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter (and IME composition) keep typing.
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={m.chat_composer_placeholder()}
          aria-label={m.chat_composer_placeholder()}
          maxLength={2000}
          rows={1}
          className="max-h-32"
        />
        <Button
          type="submit"
          size="icon"
          shape="pill"
          aria-label={m.chat_send()}
          isDisabled={!canSend}
        >
          {send.isPending ? <Spinner /> : <Send />}
        </Button>
      </div>
    </form>
  )
}
