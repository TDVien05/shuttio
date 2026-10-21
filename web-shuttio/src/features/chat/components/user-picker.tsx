import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
import { Check } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { searchUsers } from "@/features/chat/api/chat-api"
import type { FoundUser } from "@/features/chat/api/chat-api"
import { UserAvatar } from "@/features/chat/components/user-avatar"
import { m } from "@/paraglide/messages"

const MIN_QUERY = 3
const DEBOUNCE_MS = 300

/**
 * Search real users by name or exact email and tick the ones to pick. Selection
 * is owned by the caller (`selected`/`onToggle`) so it survives new searches.
 */
export function UserPicker({
  selected,
  excludeIds = [],
  onToggle,
}: {
  selected: FoundUser[]
  excludeIds?: string[]
  onToggle: (user: FoundUser) => void
}) {
  const [input, setInput] = React.useState("")
  const [query, setQuery] = React.useState("")
  React.useEffect(() => {
    const id = setTimeout(() => setQuery(input.trim()), DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [input])

  const enabled = query.length >= MIN_QUERY
  const { data, isFetching } = useQuery({
    queryKey: queryKeys.chat.users(query),
    queryFn: () => searchUsers(query),
    enabled,
    staleTime: 60_000,
  })
  const results = (data ?? []).filter((u) => !excludeIds.includes(u.id))
  const isSelected = (id: string) => selected.some((u) => u.id === id)

  return (
    <div className="flex flex-col gap-3">
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map((user) => (
            <li key={user.id}>
              <Button
                size="xs"
                shape="pill"
                variant="secondary"
                onPress={() => onToggle(user)}
              >
                {user.name}
                <span aria-hidden>×</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={m.chat_search_placeholder()}
        aria-label={m.chat_search_placeholder()}
        autoFocus
      />
      <div className="min-h-24" aria-live="polite">
        {!enabled && (
          <p className="text-sm text-muted-foreground">
            {m.chat_search_hint()}
          </p>
        )}
        {enabled && isFetching && (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        )}
        {enabled && !isFetching && results.length === 0 && (
          <p className="text-sm text-muted-foreground">{m.chat_no_results()}</p>
        )}
        {enabled && !isFetching && (
          <ul className="flex flex-col">
            {results.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left outline-none hover:bg-muted focus-visible:bg-muted"
                  onClick={() => onToggle(user)}
                >
                  <UserAvatar name={user.name} image={user.image} />
                  <span className="min-w-0 flex-1 truncate text-left">
                    {user.name}
                  </span>
                  {isSelected(user.id) && <Check />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
