import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { isToolUIPart, getToolName, isTextUIPart, isReasoningUIPart } from "ai"
import type { UIMessage } from "ai"
import { createChat } from "@shadcn/helpers/ai-sdk"
import { useNavigate } from "@tanstack/react-router"
import {
  ArrowLeft,
  ArrowUp,
  Brain,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  CornerDownRight,
  Lightbulb,
  LogIn,
  Loader2,
  MapPin,
  Plus,
  RotateCcw,
  Shield,
  Sparkles,
  Star,
  Users,
  UserPlus,
  Wrench,
  X,
  Zap,
} from "lucide-react"
import { toast } from "sonner"

import { CourtDistance } from "@/features/dashboard/components/court-distance"
import { useBookingWizard } from "@/features/booking/hooks/use-booking-wizard"
import { activeRoster, formatVnd } from "@/lib/shared"
import type {
  Court,
  Level,
  MatchRoom,
  PlaySession,
  SportKey,
} from "@/lib/shared"
import { useData } from "@/features/dashboard/components/data-provider"
import { useUserLocationContext } from "@/features/dashboard/state/location"
import { useSessionData } from "@/features/play/hooks/use-session-data"
import { useSessionActions } from "@/features/play/hooks/use-session-actions"
import {
  CourtImage,
  LevelChip,
  MatchMeter,
  SportTag,
} from "@/features/dashboard/components/shared"
import { LogoMark } from "@/components/logo"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import { DashboardWelcome } from "@/features/dashboard/components/dashboard-welcome"
import { PlayerProfileDialog } from "@/features/dashboard/components/profile-dialog"
import { Flip, gsap, prefersReducedMotion } from "@/features/landing/lib/gsap"
import { Streamdown } from "streamdown"
import "streamdown/styles.css"
import { cn } from "@/lib/utils"
import {
  chooseSuggestedCourt,
  findMatchedPlayers,
  summarizeInviteDay,
} from "@/features/play/lib/player-matching"
import type {
  PlayerMatchIntent,
  PlayerMatchResult,
} from "@/features/play/lib/player-matching"
import { ELO_ASSESSMENT_PATH } from "@/features/elo/lib/elo"
import {
  Trace,
  TraceLine,
  TraceIcon,
  TraceTitle,
  TraceDescription,
  TraceCollapsible,
  TraceCollapsibleTrigger,
  TraceCollapsibleContent,
} from "@/components/ui/trace"
import { m } from "@/paraglide/messages"

// ─── Types mirroring tool execute return values ───────────────────────────────

interface CourtToolResult {
  courts: Court[]
  sortBy: string
  sport: SportKey | null
  sports?: SportKey[] | null
  filteredByTime?: string | null
  wardMatched?: boolean | null
}

interface PlayerToolResult {
  intent: PlayerMatchIntent
  players: PlayerMatchResult[]
}

interface ClarifyToolResult {
  question: string
  options: string[]
}

interface AssessmentToolResult {
  sport: SportKey
}

interface RoomToolResult {
  rooms: MatchRoom[]
  sport: SportKey | null
  sports?: SportKey[] | null
  level: Level | null
  wardMatched?: boolean | null
}

interface BookingToolResult {
  success: boolean
  bookingId?: string
  courtId?: string
  court?: string
  ward?: string
  sport?: SportKey
  date?: string
  time?: string
  durationMin?: number
  pricePerHour?: number
  totalPrice?: number
  reason?: string
  suggestTime?: string
}

type ToolResult =
  | { kind: "courts"; value: CourtToolResult }
  | { kind: "players"; value: PlayerToolResult }
  | { kind: "rooms"; value: RoomToolResult }
  | { kind: "clarify"; value: ClarifyToolResult }
  | { kind: "assessment"; value: AssessmentToolResult }
  | { kind: "booking"; value: BookingToolResult }

function toolResult(output: unknown): ToolResult | null {
  if (!output || typeof output !== "object") return null
  const o = output as Record<string, unknown>
  if (Array.isArray(o.courts))
    return { kind: "courts", value: output as CourtToolResult }
  if (Array.isArray(o.players))
    return { kind: "players", value: output as PlayerToolResult }
  if (Array.isArray(o.rooms))
    return { kind: "rooms", value: output as RoomToolResult }
  if (typeof o.question === "string" && Array.isArray(o.options))
    return { kind: "clarify", value: output as ClarifyToolResult }
  if (typeof o.success === "boolean" && ("bookingId" in o || "reason" in o))
    return { kind: "booking", value: output as BookingToolResult }
  if (
    typeof o.sport === "string" &&
    o.sport === "badminton" &&
    !("courts" in o) &&
    !("players" in o) &&
    !("rooms" in o)
  )
    return { kind: "assessment", value: output as AssessmentToolResult }
  return null
}

function trustTone(trust: number) {
  if (trust >= 90) return "bg-brand/10 text-brand"
  if (trust >= 80) return "bg-secondary text-secondary-foreground"
  return "bg-amber-500/10 text-amber-700 dark:text-amber-300"
}

function buildInviteTitle(intent: PlayerMatchIntent) {
  const label = "Badminton"
  if (intent.timeLabel) return `${label} ${intent.timeLabel} group`
  if (intent.locationLabel) return `${label} ${intent.locationLabel} group`
  return `${label} teammate group`
}

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect

// ─── Main view ───────────────────────────────────────────────────────────────

export function AiNativeDashboardView() {
  const { courts, user: USER, players: seedPlayers } = useData()
  const { requestLocation } = useUserLocationContext()
  const { openBooking } = useBookingWizard()
  const { sessions, rooms, joinedIds, userLevelForSport } = useSessionData()
  const { createInviteRoom, addPlayersToSession, joinRoom } =
    useSessionActions()
  const navigate = useNavigate()

  const [input, setInput] = React.useState("")
  const [atHome, setAtHome] = React.useState(false)
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [profile, setProfile] = React.useState<string | null>(null)
  const [inviteState, setInviteState] = React.useState<{
    status: "idle" | "sending" | "sent"
    roomId: string | null
  }>({ status: "idle", roomId: null })
  const inviteTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLTextAreaElement>(null)
  const composerFlip = React.useRef<ReturnType<typeof Flip.getState> | null>(
    null
  )

  const resolveLocation = requestLocation
  const courtsRef = React.useRef(courts)
  courtsRef.current = courts
  const playersRef = React.useRef(seedPlayers)
  playersRef.current = seedPlayers
  const sessionsRef = React.useRef(sessions)
  sessionsRef.current = sessions
  const roomsRef = React.useRef(rooms)
  roomsRef.current = rooms

  // Predefined chat conversations via @shadcn/helpers/ai-sdk
  const chat = React.useMemo(() => {
    const c = createChat()

    // 1. "Tìm sân cầu lông gần tôi"
    c.user(m.ai_dashboard_prompts_badminton_near_me())
    c.assistant(({ writer }) => {
      writer.reasoning(
        "Đang tìm kiếm các sân cầu lông gần bạn theo khoảng cách..."
      )
      writer.tool("findCourts", {
        input: { sport: "badminton", sortBy: "distance" },
        output: {
          courts: courtsRef.current.slice(0, 4),
          sortBy: "distance",
          sport: "badminton",
        },
      })
      writer.text(
        "Dưới đây là các sân cầu lông gần vị trí của bạn nhất. Bạn có thể chọn sân và đặt trực tiếp:"
      )
    })

    // 1b. Short alias: "Tìm sân gần tôi"
    c.user(m.ai_dashboard_prompts_short_badminton_near_me())
    c.assistant(({ writer }) => {
      writer.reasoning(
        "Đang tìm kiếm các sân cầu lông gần bạn theo khoảng cách..."
      )
      writer.tool("findCourts", {
        input: { sport: "badminton", sortBy: "distance" },
        output: {
          courts: courtsRef.current.slice(0, 4),
          sortBy: "distance",
          sport: "badminton",
        },
      })
      writer.text(
        "Dưới đây là các sân cầu lông gần vị trí của bạn nhất. Bạn có thể chọn sân và đặt trực tiếp:"
      )
    })

    // 2. "Đặt sân lúc 6 giờ tối mai"
    c.user(m.ai_dashboard_prompts_book_tomorrow())
    c.assistant(({ writer }) => {
      writer.reasoning(
        "Kiểm tra lịch sân trống vào khung giờ 18:00 ngày mai..."
      )
      writer.tool("findCourts", {
        input: { sport: "badminton", date: "tomorrow", time: "18:00" },
        output: {
          courts: courtsRef.current.slice(0, 3),
          sortBy: "rating",
          sport: "badminton",
        },
      })
      writer.text(
        "Các sân sau đây còn trống vào lúc 18:00 ngày mai. Bạn có thể chọn đặt sân ngay:"
      )
    })

    // 2b. Short alias: "Đặt sân ngày mai"
    c.user(m.ai_dashboard_prompts_short_book_tomorrow())
    c.assistant(({ writer }) => {
      writer.reasoning(
        "Kiểm tra lịch sân trống vào khung giờ 18:00 ngày mai..."
      )
      writer.tool("findCourts", {
        input: { sport: "badminton", date: "tomorrow", time: "18:00" },
        output: {
          courts: courtsRef.current.slice(0, 3),
          sortBy: "rating",
          sport: "badminton",
        },
      })
      writer.text(
        "Các sân sau đây còn trống vào ngày mai. Bạn có thể chọn đặt sân ngay:"
      )
    })

    // 3. "Ghép tôi với người chơi cùng trình độ"
    c.user(m.ai_dashboard_prompts_same_level_players())
    c.assistant(({ writer }) => {
      writer.reasoning(
        "Tìm kiếm các đối thủ và đồng đội có trình độ tương đương trong khu vực..."
      )
      const res = findMatchedPlayers(
        "same level players tonight",
        playersRef.current,
        "badminton",
        "intermediate"
      )
      writer.tool("findPlayers", {
        input: { sport: "badminton" },
        output: {
          intent: res.intent,
          players: res.matches.slice(0, 4),
        },
      })
      writer.text(
        "Tìm thấy những người chơi cùng trình độ đang tìm trận. Bạn có thể chọn người chơi để gửi lời mời ghép nhóm:"
      )
    })

    // 3b. Short alias: "Ghép người chơi"
    c.user(m.ai_dashboard_prompts_short_same_level_players())
    c.assistant(({ writer }) => {
      writer.reasoning(
        "Tìm kiếm các đối thủ và đồng đội có trình độ tương đương trong khu vực..."
      )
      const res = findMatchedPlayers(
        "same level players tonight",
        playersRef.current,
        "badminton",
        "intermediate"
      )
      writer.tool("findPlayers", {
        input: { sport: "badminton" },
        output: {
          intent: res.intent,
          players: res.matches.slice(0, 4),
        },
      })
      writer.text(
        "Tìm thấy những người chơi cùng trình độ đang tìm trận. Bạn có thể chọn người chơi để gửi lời mời ghép nhóm:"
      )
    })

    // 4. "Ghép trận nhanh gần tôi"
    c.user(m.ai_dashboard_prompts_quick_match())
    c.assistant(({ writer }) => {
      writer.reasoning("Đang tìm kiếm các phòng ghép trận nhanh đang mở...")
      writer.tool("findRooms", {
        input: { sport: "badminton" },
        output: {
          rooms: roomsRef.current.slice(0, 3),
          sport: "badminton",
          level: "intermediate",
        },
      })
      writer.text(
        "Có các phòng ghép trận đang tìm người chơi. Bạn có thể tham gia ngay:"
      )
    })

    // 4b. Short alias: "Ghép trận nhanh"
    c.user(m.ai_dashboard_prompts_short_quick_match())
    c.assistant(({ writer }) => {
      writer.reasoning("Đang tìm kiếm các phòng ghép trận nhanh đang mở...")
      writer.tool("findRooms", {
        input: { sport: "badminton" },
        output: {
          rooms: roomsRef.current.slice(0, 3),
          sport: "badminton",
          level: "intermediate",
        },
      })
      writer.text(
        "Có các phòng ghép trận đang tìm người chơi. Bạn có thể tham gia ngay:"
      )
    })

    return c
  }, [])

  // Local transport with smart fallback handler for unscripted queries
  const transport = React.useMemo(() => {
    return chat.transport({
      delayMs: 25,
      fallback: ({ writer, messages: transcript }) => {
        const last = transcript[transcript.length - 1]
        const text = last.parts
          .filter((p) => p.type === "text")
          .map((p) => ("text" in p ? p.text : ""))
          .join(" ")
          .toLowerCase()

        if (
          text.includes("đặt") ||
          text.includes("book") ||
          text.includes("bk-")
        ) {
          const selectedCourt = courtsRef.current[0] as Court | undefined
          if (selectedCourt) {
            writer.reasoning("Đang tiến hành xác nhận đặt chỗ cho bạn...")
            writer.tool("bookCourt", {
              input: { courtId: selectedCourt.id, time: "19:00" },
              output: {
                success: true,
                bookingId: `BK-${selectedCourt.id.toUpperCase()}-${Math.random()
                  .toString(36)
                  .slice(2, 6)
                  .toUpperCase()}`,
                courtId: selectedCourt.id,
                court: selectedCourt.name,
                ward: selectedCourt.ward,
                sport: "badminton",
                date: "Hôm nay",
                time: "19:00",
                durationMin: 60,
                pricePerHour: selectedCourt.pricePerHour,
                totalPrice: selectedCourt.pricePerHour,
              },
            })
            writer.text(
              "Đặt sân thành công! Bạn có thể xem vé đặt sân chi tiết bên dưới:"
            )
            return
          }
        }

        if (text.includes("sân") || text.includes("court")) {
          writer.reasoning("Đang tìm kiếm sân cầu lông phù hợp...")
          writer.tool("findCourts", {
            input: { sport: "badminton" },
            output: {
              courts: courtsRef.current.slice(0, 4),
              sortBy: "rating",
              sport: "badminton",
            },
          })
          writer.text(
            "Dưới đây là các sân cầu lông phù hợp với yêu cầu của bạn:"
          )
          return
        }

        if (
          text.includes("người") ||
          text.includes("bạn") ||
          text.includes("đồng đội") ||
          text.includes("player") ||
          text.includes("ghép")
        ) {
          writer.reasoning("Đang tìm kiếm người chơi phù hợp...")
          const res = findMatchedPlayers(
            text || "badminton player",
            playersRef.current,
            "badminton",
            "intermediate"
          )
          writer.tool("findPlayers", {
            input: { sport: "badminton" },
            output: {
              intent: res.intent,
              players: res.matches.slice(0, 4),
            },
          })
          writer.text(
            "Dưới đây là danh sách những người chơi cầu lông đang hoạt động phù hợp với bạn:"
          )
          return
        }

        if (text.includes("đánh giá") || text.includes("assessment")) {
          writer.reasoning("Kiểm tra thông tin đánh giá trình độ...")
          writer.tool("requestAssessment", {
            input: { sport: "badminton" },
            output: { sport: "badminton" },
          })
          writer.text(
            "Bạn hãy hoàn thành bài kiểm tra trình độ để hệ thống ghép cặp chính xác hơn nhé:"
          )
          return
        }

        writer.reasoning("Phân tích câu hỏi của bạn...")
        writer.text(
          "Chào bạn! Tôi là trợ lý AI của SportMatch. Tôi có thể giúp bạn tìm sân gần nhất, tìm đồng đội cùng trình độ, ghép trận nhanh hoặc đặt lịch sân tức thì. Bạn hãy chọn một trong các gợi ý hoặc gửi yêu cầu cụ thể nhé!"
        )
      },
    })
  }, [chat])

  const { messages, sendMessage, status, setMessages, error, regenerate } =
    useChat({ transport })
  const isLoading = status === "streaming" || status === "submitted"

  React.useEffect(() => {
    const handleClear = () => {
      setMessages([])
      setAtHome(false)
      setInput("")
      setSelectedIds([])
      setInviteState({ status: "idle", roomId: null })
      if (inviteTimerRef.current) {
        clearTimeout(inviteTimerRef.current)
      }
    }
    window.addEventListener("clear-ai-chat", handleClear)
    return () => {
      window.removeEventListener("clear-ai-chat", handleClear)
    }
  }, [setMessages])

  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (nearBottom) el.scrollTo({ top: el.scrollHeight })
  }, [messages, isLoading])

  React.useEffect(() => {
    return () => {
      if (inviteTimerRef.current) clearTimeout(inviteTimerRef.current)
    }
  }, [])

  // ⌘K / Ctrl+K focuses the composer from anywhere on the page.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const showWelcome = messages.length === 0 || atHome

  const aiBookedCourtIds = React.useMemo(() => {
    const ids = new Set<string>()
    for (const msg of messages) {
      for (const part of msg.parts) {
        if (isToolUIPart(part) && part.state === "output-available") {
          const result = toolResult((part as { output: unknown }).output)
          if (
            result?.kind === "booking" &&
            result.value.success &&
            result.value.courtId
          ) {
            ids.add(result.value.courtId)
          }
        }
      }
    }
    return ids
  }, [messages])

  useIsomorphicLayoutEffect(() => {
    if (showWelcome) return
    const state = composerFlip.current
    if (!state) return
    composerFlip.current = null

    const flip = Flip.from(state, {
      duration: 0.55,
      ease: "power3.inOut",
    })

    const column = scrollRef.current?.firstElementChild
    const intro = column
      ? gsap.from(column.children, {
          opacity: 0,
          y: 12,
          duration: 0.4,
          ease: "power2.out",
          stagger: 0.06,
          delay: 0.1,
        })
      : null

    return () => {
      flip.kill()
      intro?.kill()
    }
  }, [showWelcome])

  const lastPlayerResult = React.useMemo<PlayerToolResult | null>(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role !== "assistant") continue
      for (const part of msg.parts) {
        if (!isToolUIPart(part) || part.state !== "output-available") continue
        const result = toolResult((part as { output: unknown }).output)
        if (result?.kind === "players") return result.value
      }
    }
    return null
  }, [messages])

  const eligibleRooms = React.useMemo<PlaySession[]>(
    () =>
      sessions.filter(
        (s) =>
          joinedIds.has(s.id) &&
          s.host.initials === USER.initials &&
          s.status !== "cancelled" &&
          activeRoster(s).length < 8
      ),
    [sessions, joinedIds, USER.initials]
  )

  const selectedPlayers = React.useMemo(
    () =>
      lastPlayerResult
        ? lastPlayerResult.players.filter((p) => selectedIds.includes(p.id))
        : [],
    [lastPlayerResult, selectedIds]
  )

  const submit = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return
    if (showWelcome && !prefersReducedMotion()) {
      composerFlip.current = Flip.getState('[data-flip-id="ai-composer"]')
    }
    setAtHome(false)
    if (inviteTimerRef.current) {
      clearTimeout(inviteTimerRef.current)
      inviteTimerRef.current = null
    }
    setSelectedIds([])
    setProfile(null)
    setInviteState({ status: "idle", roomId: null })
    setInput("")

    await resolveLocation()
    void sendMessage({ text: trimmed })
  }

  const togglePlayer = (player: PlayerMatchResult) => {
    setSelectedIds((prev) =>
      prev.includes(player.id)
        ? prev.filter((id) => id !== player.id)
        : [...prev, player.id]
    )
  }

  const openGroupChat = () => {
    if (!inviteState.roomId) return
    void navigate({
      to: "/app/chat",
      search: { channel: `room-${inviteState.roomId}` },
    })
  }

  const inviteToChat = () => {
    if (!lastPlayerResult || !selectedPlayers.length) {
      toast.error(m.ai_dashboard_select_player_error())
      return
    }
    const firstPlayer = selectedPlayers[0] as PlayerMatchResult | undefined
    const inviteSport: SportKey =
      lastPlayerResult.intent.sport ?? firstPlayer?.sport ?? "badminton"
    const suggestedCourt = chooseSuggestedCourt(
      courts,
      inviteSport,
      lastPlayerResult.intent.locationLabel
    )
    const schedule = summarizeInviteDay(lastPlayerResult.intent.timeKey)
    const inviteTitle = buildInviteTitle(lastPlayerResult.intent)
    setInviteState({ status: "sending", roomId: null })
    inviteTimerRef.current = setTimeout(() => {
      try {
        const roomId = createInviteRoom({
          title: inviteTitle,
          sport: inviteSport,
          format: selectedPlayers.length + 1 >= 4 ? "Doubles" : "Singles",
          courtId: suggestedCourt.id,
          venue: suggestedCourt.name,
          ward: lastPlayerResult.intent.locationLabel ?? suggestedCourt.ward,
          distanceKm: suggestedCourt.distanceKm,
          dayKey: schedule.dayKey,
          dayLabel: schedule.dayLabel,
          slot: schedule.slot,
          durationMin: 90,
          level:
            lastPlayerResult.intent.targetLevel ??
            userLevelForSport(inviteSport),
          pricePerHour: suggestedCourt.pricePerHour,
          invitees: selectedPlayers.map((p) => p.initials),
        })
        if (!roomId) throw new Error("Unable to create group chat")
        setInviteState({ status: "sent", roomId })
        toast.success(m.ai_dashboard_invite_sent(), {
          description: m.ai_dashboard_group_chat_created(),
        })
      } catch {
        setInviteState({ status: "idle", roomId: null })
        toast.error(m.ai_dashboard_invite_failed())
      } finally {
        inviteTimerRef.current = null
      }
    }, 700)
  }

  const addToRoom = (session: PlaySession) => {
    if (!selectedPlayers.length) {
      toast.error(m.ai_dashboard_select_player_error())
      return
    }
    const added = addPlayersToSession(
      session.id,
      selectedPlayers.map((p) => p.initials)
    )
    if (added === 0) {
      toast.error(m.ai_dashboard_invite_failed())
      return
    }
    setInviteState({ status: "sent", roomId: session.id })
    toast.success(m.ai_dashboard_added_to_room(), {
      description: m.ai_dashboard_added_to_room_desc(),
    })
  }

  const composer = (
    <div
      data-flip-id="ai-composer"
      className="rounded-sheet bg-white p-2 shadow-float ring-1 ring-line-strong transition-shadow focus-within:ring-2 focus-within:ring-electric/40"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="ml-3 size-5 shrink-0 text-electric" />
        <Textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void submit(input)
            }
          }}
          placeholder={
            isLoading
              ? m.ai_dashboard_thinking()
              : m.ai_dashboard_input_placeholder()
          }
          aria-label={m.ai_dashboard_assistant_name()}
          disabled={isLoading}
          className="max-h-32 min-h-9 flex-1 border-0 bg-transparent py-1.5 pr-0 pl-1 text-sm leading-snug shadow-none focus-visible:ring-0 sm:min-h-12 sm:py-3.5 sm:text-lg"
        />
        <kbd className="hidden shrink-0 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-mini text-muted-foreground sm:block">
          ⌘K
        </kbd>
        <Button
          variant="brand"
          shape="pill"
          type="button"
          size="icon"
          aria-label={m.ai_dashboard_send()}
          onPress={() => void submit(input)}
          isDisabled={isLoading || !input.trim()}
        >
          <ArrowUp />
        </Button>
      </div>
    </div>
  )

  const profileDialog = (
    <PlayerProfileDialog
      initials={profile}
      open={Boolean(profile)}
      onOpenChange={(open) => {
        if (!open) setProfile(null)
      }}
    />
  )

  if (showWelcome) {
    return (
      <>
        <DashboardWelcome
          composer={composer}
          onPrompt={(promptText) => void submit(promptText)}
          onBook={openBooking}
          onResume={messages.length ? () => setAtHome(false) : undefined}
        />
        {profileDialog}
      </>
    )
  }

  return (
    <div className="player-play flex h-full flex-col bg-surface-cool-2 text-ink-strong">
      <div className="shrink-0 border-b border-line bg-white/80">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setAtHome(true)}
            aria-label={m.ai_dashboard_back_home()}
            title={m.ai_dashboard_back_home()}
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border-2 border-lime text-brand transition-colors hover:bg-lime/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ArrowLeft className="size-5" />
          </button>
          <AiAvatar className="size-10" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-base leading-tight font-black">
              {m.ai_dashboard_assistant_name()}
            </p>
            <p className="flex items-center gap-1.5 text-mini text-muted-foreground">
              {isLoading ? (
                <>
                  <Loader2 className="size-3 animate-spin text-brand" />
                  {m.ai_dashboard_thinking()}
                </>
              ) : (
                <>
                  <span className="size-1.5 rounded-full bg-success" />
                  {m.ai_dashboard_assistant_online()}
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("clear-ai-chat"))
            }
            className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border-2 border-lime px-3.5 text-xs font-bold text-brand transition-colors hover:bg-lime/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <RotateCcw className="size-3.5" />
            <span className="hidden sm:inline">
              {m.ai_dashboard_clear_chat()}
            </span>
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="no-scrollbar min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6">
          {messages.map((msg, index) => (
            <ChatMessageRow
              key={msg.id}
              message={msg}
              selectedIds={selectedIds}
              interactive={!isLoading && index === messages.length - 1}
              isStreaming={isLoading && index === messages.length - 1}
              onChoose={(choice) => void submit(choice)}
              onTogglePlayer={togglePlayer}
              onOpenProfile={(p) => setProfile(p.initials)}
              onBook={(courtId) => {
                if (aiBookedCourtIds.has(courtId)) {
                  toast.info(m.ai_dashboard_already_booked())
                  return
                }
                openBooking(courtId)
              }}
              onJoinRoom={joinRoom}
            />
          ))}

          {error && !isLoading ? (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              <span className="min-w-0 flex-1">
                {m.ai_dashboard_error_message()}
                {error.message ? (
                  <span className="mt-1 block text-xs break-words opacity-70">
                    {error.message}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                onClick={() => void regenerate()}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border-2 border-lime px-3 text-xs font-bold text-brand transition-colors hover:bg-lime/30"
              >
                <RotateCcw className="size-3.5" />
                {m.ai_dashboard_retry()}
              </button>
            </div>
          ) : null}

          {isLoading && messages[messages.length - 1]?.role === "user" ? (
            <div className="flex flex-col gap-3">
              <AssistantHeader />
              <Trace>
                <TraceLine status="running">
                  <TraceIcon>
                    <Loader2 className="size-3.5 animate-spin text-brand" />
                  </TraceIcon>
                  <TraceTitle>{m.ai_dashboard_thinking()}</TraceTitle>
                </TraceLine>
              </Trace>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-4xl shrink-0 flex-col gap-2 px-4 pt-2 pb-4 sm:px-6">
        {lastPlayerResult ? (
          <div className="rounded-3xl border border-line bg-white px-3.5 py-2.5 shadow-card-lift">
            <div className="flex flex-wrap items-center gap-2">
              {selectedPlayers.length ? (
                <>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {m.ai_dashboard_selected_count({
                      count: String(selectedPlayers.length),
                    })}
                  </span>
                  {selectedPlayers.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePlayer(p)}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-surface-cool px-2.5 py-1 text-xs font-semibold text-electric-deep transition-colors hover:bg-lime/40"
                    >
                      {p.name}
                      <X className="size-3" />
                    </button>
                  ))}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {m.ai_dashboard_select_players_invite()}
                </span>
              )}
              <div className="ml-auto flex shrink-0 gap-2">
                {inviteState.status === "sent" ? (
                  <Button
                    shape="pill"
                    size="sm"
                    variant="outline"

                    onPress={() => void openGroupChat()}
                  >
                    <Sparkles />
                    {m.ai_dashboard_open_group_chat()}
                  </Button>
                ) : (
                  <>
                    {eligibleRooms.length > 0 ? (
                      <DropdownMenuTrigger>
                        <Button
                          shape="pill"
                          size="sm"
                          variant="outline"

                          isDisabled={
                            !selectedPlayers.length ||
                            inviteState.status === "sending"
                          }
                        >
                          <UserPlus />
                          {m.ai_dashboard_add_to_existing_room()}
                        </Button>
                        <DropdownMenu
                          placement="top end"
                          offset={8}
                          className="player-play-overlay w-56"
                        >
                          {eligibleRooms.map((room) => {
                            const open =
                              room.capacity - activeRoster(room).length
                            return (
                              <DropdownMenuItem
                                key={room.id}
                                onAction={() => addToRoom(room)}
                              >
                                <div className="flex min-w-0 flex-col">
                                  <span className="truncate font-medium">
                                    {room.title}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {room.dayLabel} ·{" "}
                                    {m.ai_dashboard_room_spots_open({
                                      count: String(open),
                                    })}
                                  </span>
                                </div>
                              </DropdownMenuItem>
                            )
                          })}
                        </DropdownMenu>
                      </DropdownMenuTrigger>
                    ) : null}
                    <Button
                      shape="pill"
                      size="sm"

                      onPress={inviteToChat}
                      isDisabled={
                        !selectedPlayers.length ||
                        inviteState.status === "sending"
                      }
                    >
                      <Users />
                      {inviteState.status === "sending"
                        ? m.ai_dashboard_sending()
                        : m.ai_dashboard_invite_to_group_chat()}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {composer}
      </div>

      {profileDialog}
    </div>
  )
}

// ─── Shared chat chrome ───────────────────────────────────────────────────────

const AI_TEXT = "text-sm leading-relaxed text-ink-strong sm:text-base"

const CHOICE_CHIP =
  "inline-flex cursor-pointer items-center rounded-full border-2 border-lime bg-white px-4 py-2 text-sm font-semibold text-brand transition-colors hover:bg-lime/30 disabled:cursor-not-allowed disabled:opacity-50"

const RESULT_LABEL =
  "flex items-center gap-1.5 text-mini font-bold tracking-wide text-ink-muted uppercase"

const RESULT_CARD = "rounded-3xl border border-line bg-white shadow-card-lift"

function AiAvatar({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full bg-brand text-white",
        className
      )}
    >
      <LogoMark className="size-5 text-current" />
    </span>
  )
}

// ─── Message row ──────────────────────────────────────────────────────────────

function AssistantHeader() {
  return (
    <div className="flex items-center gap-2.5">
      <AiAvatar />
      <span className="font-heading text-base font-bold">
        {m.ai_dashboard_assistant_name()}
      </span>
    </div>
  )
}

function ChatMessageRow({
  message,
  selectedIds,
  interactive,
  isStreaming,
  onChoose,
  onTogglePlayer,
  onOpenProfile,
  onBook,
  onJoinRoom,
}: {
  message: UIMessage
  selectedIds: string[]
  interactive: boolean
  isStreaming: boolean
  onChoose: (text: string) => void
  onTogglePlayer: (p: PlayerMatchResult) => void
  onOpenProfile: (p: PlayerMatchResult) => void
  onBook: (courtId: string) => void
  onJoinRoom: (room: MatchRoom) => void
}) {
  if (message.role === "user") {
    const text = message.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join("")
    return (
      <div className="flex justify-end">
        <div className="max-w-pct-85 rounded-2xl bg-muted px-4 py-2.5 text-sm whitespace-pre-wrap text-ink-strong sm:text-base">
          {text}
        </div>
      </div>
    )
  }

  if (message.role !== "assistant") return null

  const parts = message.parts
  // Reasoning + tool calls form the visible thought process; the answer text
  // reads first, followed by the rich tool results it refers to.
  const steps = parts.filter(
    (p) => (isReasoningUIPart(p) && p.text.trim()) || isToolUIPart(p)
  )
  const texts = parts.filter(isTextUIPart).filter((p) => p.text)

  return (
    <div className="flex flex-col gap-3">
      <AssistantHeader />
      <div className="flex min-w-0 flex-col gap-3">
        {steps.length ? (
          <ThoughtProcess steps={steps} done={!isStreaming} />
        ) : null}

        {texts.map((part, i) => (
          <div key={`text-${i}`} className={AI_TEXT}>
            <Streamdown animated isAnimating={isStreaming}>
              {part.text}
            </Streamdown>
          </div>
        ))}

        {parts.map((part, i) => {
          if (isToolUIPart(part)) {
            const isDone = part.state === "output-available"
            const result = isDone
              ? toolResult((part as { output: unknown }).output)
              : null

            if (isDone && result?.kind === "courts") {
              return (
                <CourtChatResult
                  key={i}
                  courts={result.value.courts}
                  sortBy={result.value.sortBy}
                  onBook={onBook}
                />
              )
            }

            if (isDone && result?.kind === "players") {
              return (
                <PlayerChatResult
                  key={i}
                  players={result.value.players}
                  selectedIds={selectedIds}
                  onToggle={onTogglePlayer}
                  onOpenProfile={onOpenProfile}
                />
              )
            }

            if (isDone && result?.kind === "rooms") {
              return (
                <RoomChatResult
                  key={i}
                  rooms={result.value.rooms}
                  onJoin={onJoinRoom}
                />
              )
            }

            if (isDone && result?.kind === "clarify") {
              return (
                <ClarifyChatResult
                  key={i}
                  question={result.value.question}
                  options={result.value.options}
                  disabled={!interactive}
                  onChoose={onChoose}
                />
              )
            }

            if (isDone && result?.kind === "assessment") {
              return (
                <RequestAssessmentChatResult
                  key={i}
                  sport={result.value.sport}
                />
              )
            }

            if (isDone && result?.kind === "booking") {
              return (
                <BookingChatResult
                  key={i}
                  booking={result.value}
                  disabled={!interactive}
                  onChoose={onChoose}
                />
              )
            }

            return null
          }

          return null
        })}
      </div>
    </div>
  )
}

// ─── Thought process (reasoning + tool calls) ────────────────────────────────

type MessagePart = UIMessage["parts"][number]

function toolLabel(toolName: string, running: boolean) {
  switch (toolName) {
    case "findCourts":
      return running
        ? m.ai_dashboard_searching_courts()
        : m.ai_dashboard_tool_find_courts()
    case "findPlayers":
      return running
        ? m.ai_dashboard_matching_players()
        : m.ai_dashboard_tool_find_players()
    case "findRooms":
      return running
        ? m.ai_dashboard_finding_rooms()
        : m.ai_dashboard_tool_find_rooms()
    case "bookCourt":
      return running
        ? m.ai_dashboard_booking_court()
        : m.ai_dashboard_tool_book_court()
    case "requestAssessment":
      return running
        ? m.ai_dashboard_working()
        : m.ai_dashboard_tool_request_assessment()
    default:
      return running ? m.ai_dashboard_working() : toolName
  }
}

function toolOutputSummary(output: unknown) {
  const result = toolResult(output)
  if (!result) return null
  switch (result.kind) {
    case "courts":
      return m.ai_dashboard_tool_result_courts({
        count: String(result.value.courts.length),
      })
    case "players":
      return m.ai_dashboard_tool_result_players({
        count: String(result.value.players.length),
      })
    case "rooms":
      return m.ai_dashboard_tool_result_rooms({
        count: String(result.value.rooms.length),
      })
    case "booking":
      return result.value.success
        ? (result.value.bookingId ?? m.ai_dashboard_booking_confirmed())
        : (result.value.reason ?? m.ai_dashboard_booking_failed())
    case "clarify":
      return result.value.question
    case "assessment":
      return m.ai_dashboard_tool_result_assessment()
  }
}

function ThoughtProcess({
  steps,
  done,
}: {
  steps: MessagePart[]
  done: boolean
}) {
  // Open while the assistant works, collapsed once it answers — unless the
  // user has toggled it themselves.
  const [userExpanded, setUserExpanded] = React.useState<boolean | null>(null)
  const isExpanded = userExpanded ?? !done

  return (
    <Trace>
      <TraceCollapsible
        isExpanded={isExpanded}
        onExpandedChange={setUserExpanded}
      >
        <TraceCollapsibleTrigger>
          <TraceLine status={done ? undefined : "running"}>
            <TraceIcon>
              {done ? (
                <Brain className="size-3.5" />
              ) : (
                <Loader2 className="size-3.5 animate-spin text-brand" />
              )}
            </TraceIcon>
            <TraceTitle>
              {done
                ? m.ai_dashboard_thought_steps({ count: String(steps.length) })
                : m.ai_dashboard_thinking()}
            </TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent className="flex flex-col gap-3 text-sm">
          {steps.map((part, i) => (
            <ThoughtStep key={i} part={part} />
          ))}
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}

function ThoughtStep({ part }: { part: MessagePart }) {
  if (isReasoningUIPart(part)) {
    const streaming = part.state === "streaming"
    return (
      <div className="flex flex-col gap-1">
        <TraceLine status={streaming ? "running" : undefined}>
          <TraceIcon>
            <Lightbulb className="size-3.5" />
          </TraceIcon>
          <TraceTitle className="font-medium text-foreground">
            {m.ai_dashboard_reasoning()}
          </TraceTitle>
        </TraceLine>
        <p className="pl-6 whitespace-pre-wrap">{part.text}</p>
      </div>
    )
  }

  if (!isToolUIPart(part)) return null

  const name = getToolName(part)
  const isDone = part.state === "output-available"
  const isError = part.state === "output-error"
  const input = (part as { input?: unknown }).input
  const params =
    input && typeof input === "object"
      ? Object.entries(input as Record<string, unknown>)
      : []
  const summary = isDone
    ? toolOutputSummary((part as { output: unknown }).output)
    : null

  return (
    <div className="flex flex-col gap-1.5">
      <TraceLine status={isError ? "error" : isDone ? undefined : "running"}>
        <TraceIcon>
          {isDone || isError ? (
            <Wrench className="size-3.5" />
          ) : (
            <Loader2 className="size-3.5 animate-spin text-brand" />
          )}
        </TraceIcon>
        <TraceTitle className="font-medium text-foreground">
          {toolLabel(name, !isDone && !isError)}
        </TraceTitle>
        <TraceDescription className="font-mono text-xs">
          {name}
        </TraceDescription>
      </TraceLine>
      {params.length ? (
        <div className="flex flex-wrap gap-1.5 pl-6">
          {params.map(([key, value]) => (
            <span
              key={key}
              className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs"
            >
              {key}: {typeof value === "string" ? value : JSON.stringify(value)}
            </span>
          ))}
        </div>
      ) : null}
      {summary ? (
        <p className="flex items-center gap-1 pl-6 text-xs">
          <CornerDownRight className="size-3 shrink-0" />
          {summary}
        </p>
      ) : null}
      {isError ? (
        <p className="pl-6 text-xs text-destructive">
          {(part as { errorText?: string }).errorText ??
            m.ai_dashboard_error_message()}
        </p>
      ) : null}
    </div>
  )
}

// ─── Clarify (human-in-the-loop) ──────────────────────────────────────────────

function ClarifyChatResult({
  question,
  options,
  disabled,
  onChoose,
}: {
  question: string
  options: string[]
  disabled: boolean
  onChoose: (text: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className={AI_TEXT}>{question}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            disabled={disabled}
            onClick={() => onChoose(option)}
            className={CHOICE_CHIP}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Assessment Required Refusal (Human-in-the-loop) ──────────────────────────

function RequestAssessmentChatResult({ sport }: { sport: SportKey }) {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col gap-3 self-start">
      <p className={AI_TEXT}>{m.ai_dashboard_require_assessment({ sport })}</p>
      <div>
        <Button
          variant="lime"
          shape="pill"
          onPress={() => void navigate({ to: ELO_ASSESSMENT_PATH })}
          className="h-10 px-5 text-sm font-bold"
        >
          {m.ai_dashboard_complete_assessment()}
        </Button>
      </div>
    </div>
  )
}

// ─── Booking confirmation ─────────────────────────────────────────────────────

function BookingChatResult({
  booking,
  disabled,
  onChoose,
}: {
  booking: BookingToolResult
  disabled: boolean
  onChoose: (text: string) => void
}) {
  if (!booking.success) {
    return (
      <div className="flex flex-col gap-2">
        <p className={cn(AI_TEXT, "text-muted-foreground")}>
          {booking.reason ?? m.ai_dashboard_booking_failed()}
        </p>
        {booking.suggestTime ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                onChoose(
                  m.ai_dashboard_book_at_instead({ time: booking.suggestTime! })
                )
              }
              className={CHOICE_CHIP}
            >
              <Clock className="mr-1.5 size-3.5" />
              {m.ai_dashboard_try_time({ time: booking.suggestTime })}
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  const mins = booking.durationMin ?? 60
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  const durationLabel =
    hrs > 0 && rem > 0 ? `${hrs}h ${rem}m` : hrs > 0 ? `${hrs}h` : `${rem}m`

  return (
    <div className="relative isolate flex max-w-md flex-col gap-3 overflow-hidden rounded-3xl bg-electric p-5 text-white shadow-electric-glow">
      <span
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-10 -z-10 size-32 rounded-full border-thick-16 border-volt/20"
      />
      <div className="flex items-center gap-2">
        <div className="grid size-7 shrink-0 place-items-center rounded-full bg-volt text-electric-deep">
          <CheckCheck className="size-3.5" />
        </div>
        <span className="text-mini font-bold tracking-eyebrow text-volt uppercase">
          {m.ai_dashboard_booking_confirmed()}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="font-heading text-lg leading-snug font-black">
          {booking.court}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-white/80 sm:text-sm">
          <MapPin className="size-3.5 shrink-0" />
          {booking.ward}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-white/80 sm:text-sm">
          <Clock className="size-3.5 shrink-0" />
          {booking.date} · {booking.time} · {durationLabel}
        </p>
      </div>
      <div className="flex items-center justify-between border-t border-white/15 pt-3">
        <span className="font-mono text-micro tracking-wider text-white/70 uppercase sm:text-xs">
          {booking.bookingId}
        </span>
        <span className="font-heading text-lg font-black text-volt tabular-nums">
          {booking.totalPrice != null ? formatVnd(booking.totalPrice) : "—"}
        </span>
      </div>
    </div>
  )
}

// ─── Court results ────────────────────────────────────────────────────────────

function CourtChatResult({
  courts,
  sortBy,
  onBook,
}: {
  courts: Court[]
  sortBy: string
  onBook: (courtId: string) => void
}) {
  const scroller = React.useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = React.useState(true)
  const [atEnd, setAtEnd] = React.useState(false)

  const sync = React.useCallback(() => {
    const el = scroller.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setAtStart(el.scrollLeft <= 2)
    setAtEnd(el.scrollLeft >= max - 2)
  }, [])

  React.useEffect(() => {
    sync()
  }, [sync, courts])

  const nudge = (dir: 1 | -1) => {
    const el = scroller.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" })
  }

  const rankLabel =
    sortBy === "price"
      ? m.ai_dashboard_rank_price()
      : sortBy === "distance"
        ? m.ai_dashboard_rank_distance()
        : sortBy === "team"
          ? m.ai_dashboard_rank_team()
          : m.ai_dashboard_rank_best()

  const single = courts.length < 2

  return (
    <div className="flex flex-col gap-1.5">
      <p className={RESULT_LABEL}>
        <MapPin className="size-3.5 text-brand" />
        {m.ai_dashboard_top_courts_ranked({
          count: String(courts.length),
          sortBy: rankLabel,
        })}
      </p>
      <div className="relative">
        <div
          ref={scroller}
          onScroll={sync}
          className="no-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden"
        >
          {courts.map((court, index) => (
            <CourtCard
              key={court.id}
              court={court}
              rank={index + 1}
              solo={single}
              onBook={onBook}
            />
          ))}
        </div>
        {!atStart ? (
          <>
            <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-surface-cool-2 to-transparent" />
            <button
              type="button"
              onClick={() => nudge(-1)}
              aria-label={m.ai_dashboard_prev_results()}
              className="absolute top-1/2 left-1 z-10 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full border-2 border-lime bg-white text-brand shadow-md transition-colors hover:bg-lime"
            >
              <ChevronLeft className="size-4" />
            </button>
          </>
        ) : null}
        {!atEnd ? (
          <>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-surface-cool-2 to-transparent" />
            <button
              type="button"
              onClick={() => nudge(1)}
              aria-label={m.ai_dashboard_next_results()}
              className="absolute top-1/2 right-1 z-10 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full border-2 border-lime bg-white text-brand shadow-md transition-colors hover:bg-lime"
            >
              <ChevronRight className="size-4" />
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}

function CourtCard({
  court,
  rank,
  solo,
  onBook,
}: {
  court: Court
  rank: number
  solo?: boolean
  onBook: (courtId: string) => void
}) {
  const scoreWord =
    court.rating >= 4.7
      ? m.court_finder_score_exceptional()
      : court.rating >= 4.5
        ? m.court_finder_score_excellent()
        : m.court_finder_score_very_good()

  return (
    <div
      className={cn(
        RESULT_CARD,
        "flex shrink-0 snap-start flex-col gap-3 p-3",
        solo ? "w-full max-w-sm" : "w-64"
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-surface-cool">
        <CourtImage court={court} className="absolute inset-0 h-full w-full" />
        <span className="absolute top-2 left-2 grid h-6 min-w-6 place-items-center rounded-full bg-volt px-2 text-xs font-black text-electric-deep shadow">
          #{rank}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <p className="truncate font-heading text-base font-bold">
          {court.name}
        </p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          {court.ward} · <CourtDistance courtId={court.id} />
        </p>
        <div className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-surface-cool px-2 py-0.5 text-xs font-semibold">
          <Star className="size-3 fill-star text-star" />
          {court.rating}
          <span className="text-micro font-medium text-muted-foreground">
            {scoreWord}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-success-ink">
          <Clock className="size-3 shrink-0" />
          {m.ai_dashboard_available_from({ time: court.nextSlot })}
          <span className="font-normal text-muted-foreground">
            · {m.ai_dashboard_slots_open({ count: String(court.openSlots) })}
          </span>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3">
        <span className="font-heading text-lg font-black text-brand tabular-nums">
          {formatVnd(court.pricePerHour)}
          <span className="text-xs font-medium text-muted-foreground">
            {m.shared_per_hour()}
          </span>
        </span>
        <Button
          variant="lime"
          shape="pill"
          size="sm"
          className="h-9 px-4 font-bold"
          onPress={() => onBook(court.id)}
        >
          {m.assistant_book()}
        </Button>
      </div>
    </div>
  )
}

// ─── Player results ───────────────────────────────────────────────────────────

function PlayerChatResult({
  players,
  selectedIds,
  onToggle,
  onOpenProfile,
}: {
  players: PlayerMatchResult[]
  selectedIds: string[]
  onToggle: (p: PlayerMatchResult) => void
  onOpenProfile: (p: PlayerMatchResult) => void
}) {
  if (!players.length) {
    return (
      <div className="rounded-3xl border border-dashed border-line-blue bg-white px-4 py-8 text-center text-sm text-muted-foreground">
        {m.ai_dashboard_no_players_found()}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className={RESULT_LABEL}>
        <Users className="size-3.5 text-brand" />
        {m.ai_dashboard_players_matched({ count: String(players.length) })}
      </p>
      {players.map((player) => (
        <PlayerChatCard
          key={player.id}
          player={player}
          selected={selectedIds.includes(player.id)}
          onToggle={() => onToggle(player)}
          onOpenProfile={() => onOpenProfile(player)}
        />
      ))}
    </div>
  )
}

// ─── Room results (Quick Match) ───────────────────────────────────────────────

function RoomChatResult({
  rooms,
  onJoin,
}: {
  rooms: MatchRoom[]
  onJoin: (room: MatchRoom) => void
}) {
  if (!rooms.length) {
    return (
      <div className="rounded-3xl border border-dashed border-line-blue bg-white px-4 py-8 text-center text-sm text-muted-foreground">
        {m.ai_dashboard_no_rooms_found()}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2.5">
      <p className={RESULT_LABEL}>
        <Zap className="size-3.5 text-brand" />
        {m.ai_dashboard_quick_match_rooms({ count: String(rooms.length) })}
      </p>
      {rooms.map((room) => (
        <RoomCard key={room.id} room={room} onJoin={onJoin} />
      ))}
    </div>
  )
}

function RoomCard({
  room,
  onJoin,
}: {
  room: MatchRoom
  onJoin: (room: MatchRoom) => void
}) {
  const { joinedIds, requestedIds } = useSessionData()
  const open = room.capacity - room.joined
  const isJoined = joinedIds.has(room.id)
  const isRequested = requestedIds.has(room.id)

  return (
    <div className={cn(RESULT_CARD, "flex flex-col gap-3 p-4")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-1.5 truncate font-heading text-sm font-semibold">
            <span className="truncate">{room.title}</span>
            {room.demo ? (
              <span
                className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-micro font-medium tracking-wider text-muted-foreground uppercase"
                title={m.match_maker_demo_join()}
              >
                {m.match_maker_demo_badge()}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3 shrink-0" />
            {room.venue ? (
              <>
                {room.venue} · {room.ward} ·{" "}
                <CourtDistance courtId={room.courtId} venue={room.venue} />
              </>
            ) : (
              m.match_maker_dialog_no_court()
            )}
          </p>
        </div>
        <SportTag sport={room.sport} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <LevelChip level={room.level} />
        <Badge variant="outline" className="text-xs">
          {room.format}
        </Badge>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="size-3 shrink-0" />
          {room.day} · {room.time}
        </span>
        <span className="flex items-center gap-1">
          <Users className="size-3 shrink-0" />
          {m.ai_dashboard_room_capacity({
            joined: String(room.joined),
            capacity: String(room.capacity),
          })}
          {open > 0 ? (
            <span className="font-semibold text-success-ink">
              · {m.ai_dashboard_room_spots_open({ count: String(open) })}
            </span>
          ) : null}
        </span>
      </div>

      <div className="flex items-center justify-between border-t border-line pt-3">
        <span className="font-heading text-base font-black text-brand tabular-nums">
          {formatVnd(room.pricePerHour)}
          <span className="text-xs font-medium text-muted-foreground">
            {m.shared_per_hour()}
          </span>
        </span>
        <Button
          shape="pill"
          size="sm"
          className="h-9 px-4 font-bold"
          variant={isJoined ? "secondary" : room.demo ? "outline" : "default"}
          isDisabled={isRequested || room.demo}
          onPress={() => onJoin(room)}
        >
          {isJoined ? (
            <>
              <CheckCheck className="size-3.5" />
              {m.ai_dashboard_joined()}
            </>
          ) : isRequested ? (
            m.ai_dashboard_requested()
          ) : room.demo ? (
            m.match_maker_demo_badge()
          ) : (
            <>
              <LogIn className="size-3.5" />
              {m.ai_dashboard_join_room()}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

function PlayerChatCard({
  player,
  selected,
  onToggle,
  onOpenProfile,
}: {
  player: PlayerMatchResult
  selected: boolean
  onToggle: () => void
  onOpenProfile: () => void
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpenProfile}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpenProfile()
        }
      }}
      className={cn(
        RESULT_CARD,
        "grid cursor-pointer gap-3 p-4 text-left transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        selected && "border-electric ring-2 ring-electric"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar className="size-11">
            <AvatarFallback
              weight="bold"
              className="bg-electric text-sm text-volt"
            >
              {player.initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate font-heading font-bold">{player.name}</h3>
              {player.online ? (
                <span className="size-2 rounded-full bg-success" aria-hidden />
              ) : null}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {player.blurb}
            </p>
          </div>
        </div>
        <MatchMeter pct={player.matchPct} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <SportTag sport={player.sport} />
        <LevelChip level={player.level} />
        <Badge variant="info" className="text-xs">
          {player.preferredArea}
        </Badge>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${trustTone(player.trust)}`}
        >
          <Shield className="size-3" />
          {player.trust}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Clock className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {player.availability[0]}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
        <p className="truncate text-xs text-muted-foreground">
          {player.reason}
        </p>
        <Button
          size="sm"
          aria-pressed={selected}
          className={cn(
            "h-9 shrink-0 rounded-full px-4 font-bold",
            selected
              ? "bg-electric text-white hover:bg-electric-deep"
              : "bg-lime text-lime-foreground hover:bg-lime/90"
          )}
          onPress={onToggle}
        >
          {selected ? (
            <CheckCheck className="size-3.5" />
          ) : (
            <Plus className="size-3.5" />
          )}
          {selected ? m.ai_dashboard_selected() : m.ai_dashboard_select()}
        </Button>
      </div>
    </article>
  )
}
