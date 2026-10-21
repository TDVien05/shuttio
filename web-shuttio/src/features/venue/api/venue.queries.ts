import * as React from "react"
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { notFound, useParams } from "@tanstack/react-router"

import { ApiError, api } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"
import {
  SCHEDULE_HOURS,
  courtById as courtByIdFn,
  courtDayEvents as courtDayEventsFn,
} from "@/lib/shared"
import type {
  BankAccount,
  BankInfo,
  BranchSummary,
  ChannelMixPoint,
  CourtBlock,
  PeakHourPoint,
  RefundQueueItem,
  Reservation,
  RevenuePoint,
  ScheduleEvent,
  ScheduleSlot,
  SportMixPoint,
  Venue,
  VenueCourt,
  VenueCustomer,
  VenueInsight,
  VenueSeed,
  VenueStats,
} from "@/lib/shared"

import { useData } from "@/features/dashboard/components/data-provider"
import {
  addCourt,
  addCourtBlock,
  addWalkInReservation,
  archiveVenue,
  cancelReservation,
  createCustomer,
  decideReservation,
  deleteCourt,
  listBanks,
  provisionVenue,
  removeCourtBlock,
  rescheduleReservation,
  restoreVenue,
  savePayout,
  saveVenuePhotos,
  updateCourt,
  updateVenue,
} from "@/features/venue/api/venue-api"
import type {
  CourtBlockInput,
  CourtInput,
  CustomerInput,
  RescheduleReservationInput,
  VenueSetupInput,
  WalkInReservationInput,
} from "@/features/venue/api/venue-api"

/** Reads owned by the venue-operator workspace. */
export const venueQueries = {
  /**
   * The account's default (first) branch bundle, or null when it has
   * provisioned none yet (404) — the "has a venue" signal.
   */
  myVenue: () =>
    queryOptions({
      queryKey: queryKeys.venue.mine(),
      queryFn: async ({ signal }) => {
        try {
          return await api<VenueSeed>("/api/venue/bundle", { signal })
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) return null
          throw err
        }
      },
    }),

  /**
   * One branch's full venue-operator bundle (`/app/venue/$venueId`). The api
   * authorizes the caller owns it — a 404/403 surfaces as not-found.
   */
  venueBundle: (venueId: string) =>
    queryOptions({
      queryKey: queryKeys.venue.detail(venueId),
      queryFn: async ({ signal }) => {
        try {
          return await api<VenueSeed>(`/api/venue/${venueId}/bundle`, {
            signal,
          })
        } catch (err) {
          if (err instanceof ApiError && [403, 404].includes(err.status)) {
            throw notFound()
          }
          throw err
        }
      },
    }),

  /** Every branch the account owns, each with a court-status rollup. */
  branchesSummary: () =>
    queryOptions({
      queryKey: queryKeys.venue.branches(),
      queryFn: ({ signal }) =>
        api<BranchSummary[]>("/api/venue/branches/summary", { signal }),
    }),

  /** The owner's saved payout account (null while none is set). */
  payout: () =>
    queryOptions({
      queryKey: queryKeys.venue.payout(),
      queryFn: async ({ signal }) =>
        (
          await api<{ payout: BankAccount | null }>("/api/brands/me/payout", {
            signal,
          })
        ).payout,
    }),

  /** The banks a VietQR transfer can target (cached for a day server-side). */
  banks: () =>
    queryOptions({
      queryKey: queryKeys.banks(),
      queryFn: ({ signal }) => listBanks(signal),
      staleTime: Infinity,
    }),
}

/** The bank list for the payout picker; `error` says VietQR couldn't list them. */
export function useBanks(): { banks: BankInfo[] | undefined; error: boolean } {
  const { data: banks, isError } = useQuery(venueQueries.banks())
  return { banks, error: isError }
}

const TIME_RANGE_RE = /(\d{2}:\d{2})/g
const ACTIVE_SCHEDULE_STATUSES = new Set<string>([
  "pending",
  "confirmed",
  "checked-in",
  "completed",
  // An unpaid `held` hold still occupies its slot — surface it on the grid so
  // the operator doesn't read a held slot as free and try to walk-in over it.
  "held",
] as const)

function toMinutes(hhmm: string): number {
  const [hour, minute] = hhmm.split(":").map(Number)
  return (hour || 0) * 60 + (minute || 0)
}

function reservationDayKey(reservation: Reservation): string {
  return reservation.dayKey ?? ""
}

function reservationStart(reservation: Reservation): string | null {
  if (reservation.start) return reservation.start
  const [start] = reservation.time.match(TIME_RANGE_RE) ?? []
  return start ?? null
}

function reservationDuration(reservation: Reservation): number {
  if (reservation.durationMin) return reservation.durationMin
  const [start, end] = reservation.time.match(TIME_RANGE_RE) ?? []
  if (!start || !end) return 60
  return Math.max(15, toMinutes(end) - toMinutes(start))
}

function overlaps(
  startA: string,
  durationA: number,
  startB: string,
  durationB: number
): boolean {
  const a = toMinutes(startA)
  const b = toMinutes(startB)
  return a < b + durationB && b < a + durationA
}

export interface VenueDataValue {
  venueId: string
  venue: Venue
  venueStats: VenueStats
  venueCourts: VenueCourt[]
  reservations: Reservation[]
  /** Bookings still owing a manual refund (SePay has no refund API) — read-only. */
  refundQueue: RefundQueueItem[]
  venueCustomers: VenueCustomer[]
  blocks: CourtBlock[]
  revenueSeries: RevenuePoint[]
  sportMix: SportMixPoint[]
  channelMix: ChannelMixPoint[]
  peakHours: PeakHourPoint[]
  venueInsights: VenueInsight[]
  courtById: (id: string) => VenueCourt | undefined
  courtDayEvents: (courtId: string, dayKey: string) => ScheduleEvent[]
  courtDaySlots: (courtId: string, dayKey: string) => ScheduleSlot[]
  venueEventsFor: (dayKey: string) => ScheduleEvent[][]
  venueScheduleFor: (dayKey: string) => ScheduleSlot[][]
}

/**
 * Venue-scoped records and helpers, derived from the branch bundle query.
 * Call sites inside `/app/venue/$venueId` omit the id; the URL segment is used.
 */
export function useVenueData(venueIdArg?: string): VenueDataValue {
  const params: { venueId?: string } = useParams({ strict: false })
  const venueId = venueIdArg ?? params.venueId
  if (!venueId) {
    throw new Error("useVenueData needs a venue id (or a $venueId route).")
  }
  const { data: seed } = useSuspenseQuery(venueQueries.venueBundle(venueId))
  const { todayIso } = useData()

  return React.useMemo<VenueDataValue>(() => {
    const venue = seed.info
    const courts = seed.courts
    const reservations = seed.reservations
    const blocks = seed.blocks

    /** Real `CourtBlock` records for a court/day, projected to `ScheduleEvent`s. */
    const blockDayEvents = (courtId: string, dayKey: string): ScheduleEvent[] =>
      blocks
        .filter(
          (block) => block.courtId === courtId && block.dateKey === dayKey
        )
        .map((block): ScheduleEvent => ({
          id: block.id,
          courtId,
          start: block.start,
          durationMin: block.durationMin,
          kind: "blocked",
          sport: courtByIdFn(courts, courtId)?.sport ?? "badminton",
          blockReason: block.reason,
          blockNote: block.note,
          past:
            dayKey === todayIso &&
            toMinutes(block.start) + block.durationMin <= toMinutes(venue.now),
        }))

    const courtDayEvents = (courtId: string, dayKey: string) => {
      const base = courtDayEventsFn(venue, courts, courtId, dayKey, todayIso)
      const reservationOverlays = reservations
        .filter((reservation) => {
          if (!ACTIVE_SCHEDULE_STATUSES.has(reservation.status)) return false
          if (reservationDayKey(reservation) !== dayKey) return false
          const mappedCourtId =
            reservation.courtId ??
            courts.find((court) => court.name === reservation.court)?.id
          return mappedCourtId === courtId
        })
        .map((reservation) => {
          const start = reservationStart(reservation)
          if (!start) return null
          const durationMin = reservationDuration(reservation)
          const event: ScheduleEvent = {
            id: reservation.id,
            courtId,
            start,
            durationMin,
            kind:
              reservation.status === "held"
                ? "held"
                : reservation.bookingStatus === "awaiting_venue_confirmation"
                  ? "awaiting"
                  : reservation.source === "walk-in"
                    ? "walk-in"
                    : "booked",
            customer: reservation.customer.name,
            customerPhone: reservation.customer.phone,
            sport: reservation.sport,
            party: reservation.party,
            past:
              dayKey === todayIso &&
              toMinutes(start) + durationMin <= toMinutes(venue.now),
          }
          return event
        })
        .filter((event): event is ScheduleEvent => event !== null)

      const blockOverlays = blockDayEvents(courtId, dayKey)
      const overlays = [...reservationOverlays, ...blockOverlays]
      if (!overlays.length) return base

      // A block always wins its slot over both the seed-filler base events and
      // a reservation (the API already rejects a block over a live booking and
      // vice versa, but the overlay stays defensive for stale/pre-blocks data).
      const filteredBase = base.filter((event) =>
        overlays.every(
          (overlay) =>
            !overlaps(
              event.start,
              event.durationMin,
              overlay.start,
              overlay.durationMin
            )
        )
      )
      const filteredReservations = blockOverlays.length
        ? reservationOverlays.filter((reservation) =>
            blockOverlays.every(
              (block) =>
                !overlaps(
                  reservation.start,
                  reservation.durationMin,
                  block.start,
                  block.durationMin
                )
            )
          )
        : reservationOverlays

      return [...filteredBase, ...filteredReservations, ...blockOverlays].sort(
        (a, b) => toMinutes(a.start) - toMinutes(b.start)
      )
    }
    const courtDaySlots = (courtId: string, dayKey: string) => {
      const court = courtByIdFn(courts, courtId)
      const sport = court?.sport ?? "badminton"
      const events = courtDayEvents(courtId, dayKey)
      const nowIdx = SCHEDULE_HOURS.indexOf(venue.now)
      return SCHEDULE_HOURS.map((hour, index): ScheduleSlot => {
        const event = events.find((item) =>
          overlaps(hour, 60, item.start, item.durationMin)
        )
        const past = dayKey === todayIso && index < nowIdx
        if (!event) {
          return { courtId, hour, kind: "free", sport, past }
        }
        return {
          courtId,
          hour,
          kind: event.kind,
          customer: event.customer,
          sport,
          party: event.party,
          past,
        } satisfies ScheduleSlot
      })
    }
    const venueEventsFor = (dayKey: string) =>
      courts.map((court) => courtDayEvents(court.id, dayKey))
    const venueScheduleFor = (dayKey: string) =>
      courts.map((court) => courtDaySlots(court.id, dayKey))

    return {
      venueId,
      venue,
      venueStats: seed.stats,
      venueCourts: courts,
      reservations,
      refundQueue: seed.refundQueue,
      venueCustomers: seed.customers,
      blocks,
      revenueSeries: seed.revenueSeries,
      sportMix: seed.sportMix,
      channelMix: seed.channelMix,
      peakHours: seed.peakHours,
      venueInsights: seed.insights,
      courtById: (id) => courtByIdFn(courts, id),
      courtDayEvents,
      courtDaySlots,
      venueEventsFor,
      venueScheduleFor,
    }
  }, [seed, venueId, todayIso])
}

/**
 * The live approval queue. Mount if a screen wants the bundle refreshed every
 * 10 s; the layout mounts it once so the interval does not depend on which
 * page happens to be open. All observers share the same bundle cache entry.
 */
export function useVenueReservations(venueId: string) {
  return useQuery({
    ...venueQueries.venueBundle(venueId),
    select: (seed) => seed.reservations,
    refetchInterval: 10_000,
  })
}

// ── Mutations ────────────────────────────────────────────────────────────────
// Venue writes refetch the affected bundle after the server confirms. The
// bundle is also the venue's aggregate (customers, blocks, stats), so a
// targeted invalidate is both simpler and more correct than hand-patching
// every derived list.

function useInvalidateVenue(venueId: string) {
  const queryClient = useQueryClient()
  return React.useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.venue.detail(venueId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.venue.branches(),
        }),
      ]),
    [queryClient, venueId]
  )
}

export function useProvisionVenue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: VenueSetupInput) => provisionVenue(input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.venue.all() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.seed() }),
      ]),
  })
}

export function useUpdateVenue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string
      input: Partial<Parameters<typeof updateVenue>[1]>
    }) => updateVenue(id, input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.venue.all() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.seed() }),
      ]),
  })
}

export function useArchiveVenue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => archiveVenue(id),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.venue.all() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.seed() }),
      ]),
  })
}

export function useRestoreVenue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => restoreVenue(id),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.venue.all() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.seed() }),
      ]),
  })
}

export function useSaveVenuePhotos(venueId: string) {
  const invalidate = useInvalidateVenue(venueId)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (photos: string[]) => saveVenuePhotos(venueId, photos),
    onSuccess: async (photos) => {
      queryClient.setQueryData<VenueSeed>(
        queryKeys.venue.detail(venueId),
        (seed) => seed && { ...seed, info: { ...seed.info, photos } }
      )
      await invalidate()
    },
  })
}

export function useAddCourt(venueId: string) {
  const invalidate = useInvalidateVenue(venueId)
  return useMutation({
    mutationFn: (input: CourtInput) => addCourt(venueId, input),
    onSuccess: () => invalidate(),
  })
}

export function useUpdateCourt(venueId: string) {
  const invalidate = useInvalidateVenue(venueId)
  return useMutation({
    mutationFn: ({
      courtId,
      input,
    }: {
      courtId: string
      input: Partial<CourtInput>
    }) => updateCourt(venueId, courtId, input),
    onSuccess: () => invalidate(),
  })
}

export function useDeleteCourt(venueId: string) {
  const invalidate = useInvalidateVenue(venueId)
  return useMutation({
    mutationFn: (courtId: string) => deleteCourt(venueId, courtId),
    onSuccess: () => invalidate(),
  })
}

export function useAddWalkInReservation(venueId: string) {
  const invalidate = useInvalidateVenue(venueId)
  return useMutation({
    mutationFn: (input: WalkInReservationInput) =>
      addWalkInReservation(venueId, input),
    onSuccess: () => invalidate(),
  })
}

/** Approve/decline is optimistic: the operator sees the row flip at once. */
export interface ReservationDecisionInput {
  id: string
  decision: "approved" | "declined"
  reason?: string
}

/** Apply one approval/decline to a reservation row. */
function decideReservationRow(
  reservation: Reservation,
  input: ReservationDecisionInput
): Reservation {
  if (reservation.id !== input.id) return reservation
  return {
    ...reservation,
    status: input.decision === "approved" ? "confirmed" : "cancelled",
    ...(input.decision === "declined" && input.reason
      ? { declineReason: input.reason }
      : {}),
  }
}

/**
 * Apply an approval/decline to the cached venue bundle, leaving every other
 * reservation untouched. Pure so the optimistic view can be unit-tested.
 */
export function applyReservationDecision(
  seed: VenueSeed | undefined,
  input: ReservationDecisionInput
): VenueSeed | undefined {
  if (!seed) return seed
  return {
    ...seed,
    reservations: seed.reservations.map((reservation) =>
      decideReservationRow(reservation, input)
    ),
  }
}

export function useDecideReservation(venueId: string) {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateVenue(venueId)

  return useMutation({
    mutationFn: (input: ReservationDecisionInput) =>
      decideReservation(venueId, input.id, input.decision, input.reason),

    onMutate: async (input) => {
      // 1. Stop an in-flight bundle read from overwriting the optimistic view.
      await queryClient.cancelQueries({
        queryKey: queryKeys.venue.detail(venueId),
      })
      // 2. Snapshot the cache so a rejected decision can restore it.
      const previous = queryClient.getQueryData<VenueSeed>(
        queryKeys.venue.detail(venueId)
      )
      // 3. Write the optimistic status flip.
      queryClient.setQueryData<VenueSeed>(
        queryKeys.venue.detail(venueId),
        (seed) => applyReservationDecision(seed, input)
      )
      // 4. Hand the snapshot to onError.
      return { previous }
    },

    onError: (_error, _vars, context) => {
      if (context) {
        queryClient.setQueryData(
          queryKeys.venue.detail(venueId),
          context.previous
        )
      }
    },

    onSettled: () => invalidate(),
  })
}

export function useCancelReservation(venueId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      cancelReservation(venueId, id, reason),
    onSuccess: (updated) => {
      queryClient.setQueryData<VenueSeed>(
        queryKeys.venue.detail(venueId),
        (seed) =>
          seed && {
            ...seed,
            reservations: seed.reservations.map((reservation) =>
              reservation.id === updated.id ? updated : reservation
            ),
          }
      )
    },
  })
}

export function useRescheduleReservation(venueId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string
      input: RescheduleReservationInput
    }) => rescheduleReservation(venueId, id, input),
    onSuccess: (updated) => {
      queryClient.setQueryData<VenueSeed>(
        queryKeys.venue.detail(venueId),
        (seed) =>
          seed && {
            ...seed,
            reservations: seed.reservations.map((reservation) =>
              reservation.id === updated.id ? updated : reservation
            ),
          }
      )
    },
  })
}

export function useCreateCustomer(venueId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CustomerInput) => createCustomer(venueId, input),
    onSuccess: (created) => {
      queryClient.setQueryData<VenueSeed>(
        queryKeys.venue.detail(venueId),
        (seed) =>
          seed && {
            ...seed,
            customers: seed.customers.some((c) => c.id === created.id)
              ? seed.customers.map((c) => (c.id === created.id ? created : c))
              : [...seed.customers, created],
          }
      )
    },
  })
}

export function useAddCourtBlock(venueId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CourtBlockInput) => addCourtBlock(venueId, input),
    onSuccess: (block) => {
      queryClient.setQueryData<VenueSeed>(
        queryKeys.venue.detail(venueId),
        (seed) =>
          seed && {
            ...seed,
            blocks: seed.blocks.some((b) => b.id === block.id)
              ? seed.blocks
              : [...seed.blocks, block],
          }
      )
    },
  })
}

export function useRemoveCourtBlock(venueId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (blockId: string) => removeCourtBlock(venueId, blockId),
    onSuccess: (_result, blockId) => {
      queryClient.setQueryData<VenueSeed>(
        queryKeys.venue.detail(venueId),
        (seed) =>
          seed && {
            ...seed,
            blocks: seed.blocks.filter((block) => block.id !== blockId),
          }
      )
    },
  })
}

export function useSavePayout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Parameters<typeof savePayout>[0]) => savePayout(input),
    onSuccess: (result) => {
      if (result.ok) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.venue.payout(),
        })
      }
    },
  })
}
