import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { initialsOf } from "@/features/chat/lib/chat-utils"

/** A person's picture, falling back to their initials. */
export function UserAvatar({
  name,
  image,
  size,
}: {
  name: string
  image?: string
  size?: "sm" | "default" | "lg"
}) {
  return (
    <Avatar size={size}>
      {image && <AvatarImage src={image} alt="" />}
      <AvatarFallback>{initialsOf(name)}</AvatarFallback>
    </Avatar>
  )
}
