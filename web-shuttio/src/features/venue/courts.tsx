import { z } from "zod"
import { formatVndText } from "@/lib/money"
import * as React from "react"
import { toast } from "sonner"
import { LayoutGrid, MoreVertical, Pencil, Plus, Wrench } from "lucide-react"

import { useAppForm } from "@/components/form"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { courtStateAccent } from "@/features/venue/data"
import type { CourtState, SportKey, VenueCourt } from "@/features/venue/data"
import { useVenueData } from "@/features/venue/venue-data-provider"
import { addCourt, deleteCourt, updateCourt } from "@/features/venue/venue-api"
import type { CourtInput } from "@/features/venue/venue-api"
import { SportTag } from "@/features/dashboard/shared"
import { VenuePhotosPanel } from "@/features/venue/venue-photos"
import { VenueEmpty, VenuePanel } from "@/features/venue/shared"
import { m } from "@/paraglide/messages"

const stateMessages = {
  available: m.venue_courts_state_available,
  inPlay: m.venue_courts_state_in_play,
  upcoming: m.venue_courts_state_upcoming,
  maintenance: m.venue_courts_state_maintenance,
} as const

const COURT_STATES: CourtState[] = [
  "available",
  "in-play",
  "upcoming",
  "maintenance",
]

interface CourtDraft {
  name: string
  sport: SportKey
  surface: string
  pricePerHour: number
  state: CourtState
}

function draftFromCourt(court: VenueCourt): CourtDraft {
  return {
    name: court.name,
    sport: court.sport,
    surface: court.surface,
    pricePerHour: court.pricePerHour,
    state: court.state,
  }
}

function emptyDraft(defaultSport: SportKey): CourtDraft {
  return {
    name: "",
    sport: defaultSport,
    surface: "",
    pricePerHour: 300000,
    state: "available",
  }
}

export function VenueCourtsView({
  embedded = false,
}: {
  embedded?: boolean
} = {}) {
  const { venueId, venueCourts } = useVenueData()

  const [isFormOpen, setIsFormOpen] = React.useState(false)
  const [editingCourt, setEditingCourt] = React.useState<VenueCourt | null>(
    null
  )
  const [archiveTarget, setArchiveTarget] = React.useState<VenueCourt | null>(
    null
  )
  const [isPending, startTransition] = React.useTransition()

  const courts = React.useMemo(
    () => venueCourts.filter((court) => !court.archived),
    [venueCourts]
  )

  const stateLabel: Record<CourtState, string> = {
    available: m.venue_courts_state_available(),
    "in-play": m.venue_courts_state_in_play(),
    upcoming: m.venue_courts_state_upcoming(),
    maintenance: m.venue_courts_state_maintenance(),
  }

  const openAddDialog = React.useCallback(() => {
    setEditingCourt(null)
    setIsFormOpen(true)
  }, [])

  const openEditDialog = React.useCallback((court: VenueCourt) => {
    setEditingCourt(court)
    setIsFormOpen(true)
  }, [])

  const closeFormDialog = React.useCallback(() => {
    setIsFormOpen(false)
    setEditingCourt(null)
  }, [])

  const handleSubmit = React.useCallback(
    (draft: CourtDraft) => {
      const input: CourtInput = {
        name: draft.name,
        sport: draft.sport,
        surface: draft.surface,
        pricePerHour: draft.pricePerHour,
        state: draft.state,
      }
      startTransition(async () => {
        try {
          if (editingCourt) {
            await updateCourt(venueId, editingCourt.id, input)
            toast.success(m.venue_courts_toasts_updated())
          } else {
            await addCourt(venueId, input)
            toast.success(m.venue_courts_toasts_added())
          }
          closeFormDialog()
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : m.venue_courts_toasts_save_error()
          )
        }
      })
    },
    [editingCourt, venueId, closeFormDialog]
  )

  const handleArchive = React.useCallback(() => {
    if (!archiveTarget) return
    const court = archiveTarget
    startTransition(async () => {
      try {
        await deleteCourt(venueId, court.id)
        toast.success(m.venue_courts_toasts_archived({ name: court.name }))
        setArchiveTarget(null)
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : m.venue_courts_toasts_archive_error()
        )
      }
    })
  }, [archiveTarget, venueId])

  return (
    <div className="flex flex-col gap-5">
      {!embedded ? (
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {m.venue_courts_title()}
          </h1>
          <p className="text-sm text-muted-foreground">
            {m.venue_courts_subtitle()}
          </p>
        </div>
      ) : null}

      {/* Keyed so switching branch resets the panel's local gallery copy. */}
      <VenuePhotosPanel key={venueId} />

      <VenuePanel
        title={m.venue_courts_list_title()}
        icon={LayoutGrid}
        action={
          <Button size="sm" onPress={openAddDialog} className="rounded-full">
            <Plus className="mr-1 size-4" />
            {m.venue_courts_add_button()}
          </Button>
        }
      >
        {courts.length ? (
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/50">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-10 px-4 py-2">
                    {m.venue_courts_col_name()}
                  </TableHead>
                  <TableHead className="h-10 px-4 py-2">
                    {m.venue_courts_col_sport()}
                  </TableHead>
                  <TableHead className="h-10 px-4 py-2">
                    {m.venue_courts_col_surface()}
                  </TableHead>
                  <TableHead className="h-10 px-4 py-2 text-right">
                    {m.venue_courts_col_price()}
                  </TableHead>
                  <TableHead className="h-10 px-4 py-2">
                    {m.venue_courts_col_state()}
                  </TableHead>
                  <TableHead className="h-10 px-4 py-2">
                    <span className="sr-only">
                      {m.venue_courts_col_actions()}
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courts.map((court) => (
                  <TableRow key={court.id} className="hover:bg-muted/40">
                    <TableCell className="px-4 py-3 align-middle font-medium text-foreground">
                      {court.name}
                    </TableCell>
                    <TableCell className="px-4 py-3 align-middle">
                      <SportTag sport={court.sport} />
                    </TableCell>
                    <TableCell className="px-4 py-3 align-middle text-sm text-muted-foreground">
                      {court.surface || "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right align-middle font-heading text-sm font-semibold text-foreground tabular-nums">
                      {formatVndText(court.pricePerHour)}
                    </TableCell>
                    <TableCell className="px-4 py-3 align-middle">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                          courtStateAccent[court.state]
                        )}
                      >
                        {court.state === "maintenance" ? (
                          <Wrench className="size-3" />
                        ) : null}
                        {stateLabel[court.state]}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right align-middle">
                      <DropdownMenuTrigger>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="rounded-full text-muted-foreground"
                          aria-label={m.venue_courts_row_actions()}
                        >
                          <MoreVertical className="size-4" />
                        </Button>
                        <DropdownMenu placement="bottom end">
                          <DropdownMenuItem
                            onAction={() => openEditDialog(court)}
                          >
                            <Pencil />
                            {m.venue_courts_edit()}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onAction={() => setArchiveTarget(court)}
                          >
                            {m.venue_courts_archive()}
                          </DropdownMenuItem>
                        </DropdownMenu>
                      </DropdownMenuTrigger>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <VenueEmpty text={m.venue_courts_empty()} />
        )}
      </VenuePanel>

      {isFormOpen ? (
        <CourtFormDialog
          court={editingCourt}
          isPending={isPending}
          onClose={closeFormDialog}
          onSubmit={handleSubmit}
        />
      ) : null}

      <Dialog
        isOpen={archiveTarget !== null}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>{m.venue_courts_archive_dialog_title()}</DialogTitle>
          <DialogDescription>
            {m.venue_courts_archive_dialog_description({
              name: archiveTarget?.name ?? "",
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onPress={() => setArchiveTarget(null)}
            isDisabled={isPending}
          >
            {m.venue_courts_archive_dialog_cancel()}
          </Button>
          <Button
            variant="destructive"
            isDisabled={isPending}
            onPress={handleArchive}
          >
            {isPending
              ? m.venue_courts_archive_dialog_pending()
              : m.venue_courts_archive_dialog_confirm()}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}

interface CourtFormDialogProps {
  court: VenueCourt | null
  isPending: boolean
  onClose: () => void
  onSubmit: (draft: CourtDraft) => void
}

const courtSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: () => m.venue_courts_form_name_required() }),
  sport: z.custom<SportKey>(),
  surface: z.string(),
  pricePerHour: z.number().min(0),
  state: z.custom<CourtState>(),
})

/**
 * Only ever mounted by the parent while it should be open (see
 * `VenueCourtsView`'s `isFormOpen ? <CourtFormDialog ... /> : null`), so the
 * form's default values are always fresh for the court being added/edited.
 */
function CourtFormDialog({
  court,
  isPending,
  onClose,
  onSubmit,
}: CourtFormDialogProps) {
  const isEditing = court !== null
  const defaultValues: CourtDraft = court
    ? draftFromCourt(court)
    : emptyDraft("badminton")
  const form = useAppForm({
    defaultValues,
    validators: { onChange: courtSchema },
    onSubmit: ({ value }) => onSubmit({ ...value, name: value.name.trim() }),
  })

  return (
    <Dialog
      isOpen
      onOpenChange={(next) => !next && onClose()}
      className="sm:max-w-md"
    >
      <DialogHeader>
        <DialogTitle>
          {isEditing
            ? m.venue_courts_edit_dialog_title()
            : m.venue_courts_add_dialog_title()}
        </DialogTitle>
        <DialogDescription>
          {isEditing
            ? m.venue_courts_edit_dialog_description()
            : m.venue_courts_add_dialog_description()}
        </DialogDescription>
      </DialogHeader>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.AppField name="name">
          {(field) => (
            <field.TextField
              label={m.venue_courts_form_name()}
              autoComplete="off"
              placeholder={m.venue_courts_form_name_placeholder()}
            />
          )}
        </form.AppField>
        <form.Field name="state">
          {(field) => (
            <Select
              className="flex w-full flex-col gap-2"
              value={field.state.value}
              onChange={(v) => {
                const next = COURT_STATES.find((s) => s === v)
                if (next) field.handleChange(next)
              }}
            >
              <FieldLabel>{m.venue_courts_form_state()}</FieldLabel>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COURT_STATES.map((s) => (
                  <SelectItem key={s} id={s}>
                    {stateMessages[stateKey(s)]()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </form.Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <form.AppField name="surface">
            {(field) => (
              <field.TextField
                label={m.venue_courts_form_surface()}
                autoComplete="off"
                placeholder={m.venue_courts_form_surface_placeholder()}
              />
            )}
          </form.AppField>
          <form.Field name="pricePerHour">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="court-price">
                  {m.venue_courts_form_price()}
                </FieldLabel>
                <Input
                  id="court-price"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={10000}
                  value={String(field.state.value)}
                  onBlur={field.handleBlur}
                  onChange={(e) =>
                    field.handleChange(Math.max(0, Number(e.target.value) || 0))
                  }
                />
              </Field>
            )}
          </form.Field>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onPress={onClose}
            isDisabled={isPending}
          >
            {m.venue_courts_form_cancel()}
          </Button>
          <form.Subscribe selector={(state) => state.canSubmit}>
            {(canSubmit) => (
              <Button type="submit" isDisabled={isPending || !canSubmit}>
                {isPending
                  ? m.venue_courts_form_saving()
                  : m.venue_courts_form_submit()}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>
    </Dialog>
  )
}

/** Maps a `CourtState` to its `state.*` i18n key (the one non-slug case is `in-play` → `inPlay`). */
function stateKey(
  state: CourtState
): "available" | "inPlay" | "upcoming" | "maintenance" {
  return state === "in-play" ? "inPlay" : state
}
