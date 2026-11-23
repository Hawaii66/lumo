import { Bookmark, Flame, GraduationCap, Lightbulb } from "lucide-react"
import { useEffect, useState, type ComponentType } from "react"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Textarea } from "~/components/ui/textarea"
import {
  PROBLEM_REASON_IDS,
  PROBLEM_REASON_NOTE_MAX,
  type ProblemReasonId,
} from "~/lib/problem-reasons"
import { cn } from "~/lib/utils"

export type ProblemReasonEntry = {
  /** `""` = whole problem; otherwise `a`–`z`. */
  letter: string
  reason: ProblemReasonId
  note?: string
}

export function reasonForLetter(
  entries: Array<ProblemReasonEntry>,
  letter: string,
): ProblemReasonEntry | undefined {
  return entries.find((row) => row.letter === letter)
}

type ReasonMeta = {
  id: ProblemReasonId
  label: string
  Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  /** Classes for the colored icon / active control. */
  iconClassName: string
  activeButtonClassName: string
  chipClassName: string
}

export const REASON_META: Record<ProblemReasonId, ReasonMeta> = {
  hard: {
    id: "hard",
    label: "Svår",
    Icon: Flame,
    iconClassName: "text-rose-600",
    activeButtonClassName:
      "border-rose-600/50 bg-rose-500/15 text-rose-700 hover:bg-rose-500/25",
    chipClassName:
      "border-rose-600/60 bg-rose-500/15 text-foreground",
  },
  insight: {
    id: "insight",
    label: "Bra insikt",
    Icon: Lightbulb,
    iconClassName: "text-amber-600",
    activeButtonClassName:
      "border-amber-600/50 bg-amber-500/15 text-amber-800 hover:bg-amber-500/25",
    chipClassName:
      "border-amber-600/60 bg-amber-500/15 text-foreground",
  },
  teacher: {
    id: "teacher",
    label: "Behöver lärarhjälp",
    Icon: GraduationCap,
    iconClassName: "text-sky-600",
    activeButtonClassName:
      "border-sky-600/50 bg-sky-500/15 text-sky-800 hover:bg-sky-500/25",
    chipClassName:
      "border-sky-600/60 bg-sky-500/15 text-foreground",
  },
  other: {
    id: "other",
    label: "Övrigt",
    Icon: Bookmark,
    iconClassName: "text-violet-600",
    activeButtonClassName:
      "border-violet-600/50 bg-violet-500/15 text-violet-800 hover:bg-violet-500/25",
    chipClassName:
      "border-violet-600/60 bg-violet-500/15 text-foreground",
  },
}

type ProblemReasonDisplayProps = {
  entries: Array<ProblemReasonEntry>
  className?: string
  /** When set, icons are clickable (e.g. open detail modal). */
  onSelect?: (entry: ProblemReasonEntry) => void
}

/** Read-only reason icons for the sidebar list. */
export function ProblemReasonDisplay({
  entries,
  className,
  onSelect,
}: ProblemReasonDisplayProps) {
  if (entries.length === 0) return null

  const letterEntries = entries
    .filter((entry) => entry.letter !== "")
    .sort((a, b) => a.letter.localeCompare(b.letter))

  if (letterEntries.length > 0) {
    return (
      <span
        className={cn("inline-flex shrink-0 items-center gap-1", className)}
      >
        {letterEntries.map((entry) => {
          const meta = REASON_META[entry.reason]
          const Icon = meta.Icon
          const label = `${entry.letter}: ${meta.label}`
          const content = (
            <>
              <span className="text-[10px] font-medium text-muted-foreground">
                {entry.letter}:
              </span>
              <Icon
                className={cn("size-2.5", meta.iconClassName)}
                aria-hidden
              />
            </>
          )
          if (onSelect) {
            return (
              <span
                key={entry.letter}
                role="button"
                tabIndex={0}
                title={label}
                aria-label={label}
                className="inline-flex cursor-pointer items-center gap-0.5 rounded-sm hover:bg-muted/70"
                onClick={(event) => {
                  event.stopPropagation()
                  onSelect(entry)
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return
                  event.preventDefault()
                  event.stopPropagation()
                  onSelect(entry)
                }}
              >
                {content}
              </span>
            )
          }
          return (
            <span
              key={entry.letter}
              className="inline-flex items-center gap-0.5"
              title={label}
              aria-label={label}
            >
              {content}
            </span>
          )
        })}
      </span>
    )
  }

  const whole = entries.find((entry) => entry.letter === "")
  if (whole === undefined) return null
  const meta = REASON_META[whole.reason]
  const Icon = meta.Icon

  if (onSelect) {
    return (
      <span
        role="button"
        tabIndex={0}
        title={meta.label}
        aria-label={meta.label}
        className={cn(
          "inline-flex shrink-0 cursor-pointer items-center rounded-sm hover:bg-muted/70",
          className,
        )}
        onClick={(event) => {
          event.stopPropagation()
          onSelect(whole)
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          event.stopPropagation()
          onSelect(whole)
        }}
      >
        <Icon className={cn("size-3", meta.iconClassName)} aria-hidden />
      </span>
    )
  }

  return (
    <span
      className={cn("inline-flex shrink-0 items-center", className)}
      title={meta.label}
      aria-label={meta.label}
    >
      <Icon className={cn("size-3", meta.iconClassName)} aria-hidden />
    </span>
  )
}

type ProblemReasonControlProps = {
  entry: ProblemReasonEntry | undefined
  onSave: (reason: ProblemReasonId, note: string) => void
  letter?: string
  className?: string
}

/** Toggle / edit control for the problem detail view. */
export function ProblemReasonControl({
  entry,
  onSave,
  letter,
  className,
}: ProblemReasonControlProps) {
  const [open, setOpen] = useState(false)
  const named = letter !== undefined && letter !== ""
  const scope = named ? `deluppgift (${letter})` : "uppgiften"
  const meta = entry ? REASON_META[entry.reason] : null
  const Icon = meta?.Icon ?? Bookmark
  const label = entry
    ? `Ändra markering för ${scope}`
    : `Markera ${scope} att återkomma till`

  return (
    <>
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-pressed={entry !== undefined}
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-[transform,colors,background-color,border-color] duration-100",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          "active:scale-90",
          meta
            ? meta.activeButtonClassName
            : "border-border text-muted-foreground hover:bg-muted/60",
          className,
        )}
      >
        <Icon
          className={cn(
            "size-4 transition-[opacity,transform] duration-150",
            meta ? "opacity-100 scale-100" : "scale-90",
          )}
          aria-hidden
        />
      </button>
      <ProblemReasonPickDialog
        open={open}
        onOpenChange={setOpen}
        initial={entry}
        letter={letter}
        onSave={(reason, note) => {
          onSave(reason, note)
          setOpen(false)
        }}
      />
    </>
  )
}

type ProblemReasonPickDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: ProblemReasonEntry | undefined
  letter?: string
  onSave: (reason: ProblemReasonId, note: string) => void
}

function ProblemReasonPickDialog({
  open,
  onOpenChange,
  initial,
  letter,
  onSave,
}: ProblemReasonPickDialogProps) {
  const [reason, setReason] = useState<ProblemReasonId>(
    initial?.reason ?? "hard",
  )
  const [note, setNote] = useState(initial?.note ?? "")

  useEffect(() => {
    if (!open) return
    setReason(initial?.reason ?? "hard")
    setNote(initial?.note ?? "")
  }, [open, initial])

  const named = letter !== undefined && letter !== ""
  const title = named
    ? `Markera deluppgift (${letter})`
    : "Markera uppgiften"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Välj en anledning och valfri anteckning. Max en markering per
            uppgift.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div
            className="grid grid-cols-2 gap-2"
            role="radiogroup"
            aria-label="Anledning"
          >
            {PROBLEM_REASON_IDS.map((id) => {
              const meta = REASON_META[id]
              const Icon = meta.Icon
              const selected = reason === id
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setReason(id)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    selected
                      ? meta.chipClassName
                      : "border-border bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-3.5 shrink-0",
                      selected ? meta.iconClassName : "text-muted-foreground",
                    )}
                    aria-hidden
                  />
                  {meta.label}
                </button>
              )
            })}
          </div>
          <div className="grid gap-1.5">
            <label
              htmlFor="problem-reason-note"
              className="text-xs font-medium text-muted-foreground"
            >
              Anteckning (valfritt)
            </label>
            <Textarea
              id="problem-reason-note"
              value={note}
              maxLength={PROBLEM_REASON_NOTE_MAX}
              rows={3}
              placeholder="Skriv något att komma ihåg…"
              onChange={(event) => setNote(event.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">
              {note.length}/{PROBLEM_REASON_NOTE_MAX}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Avbryt
          </Button>
          <Button type="button" onClick={() => onSave(reason, note)}>
            Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type ProblemReasonDetailDialogProps = {
  entry: ProblemReasonEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onClear: () => void
}

/** Sidebar/detail modal: show reason + note, with clear. */
export function ProblemReasonDetailDialog({
  entry,
  open,
  onOpenChange,
  onClear,
}: ProblemReasonDetailDialogProps) {
  if (entry === null) return null
  const meta = REASON_META[entry.reason]
  const Icon = meta.Icon
  const named = entry.letter !== ""
  const title = named
    ? `Markering (${entry.letter})`
    : "Markering"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            <Icon
              className={cn("size-4", meta.iconClassName)}
              aria-hidden
            />
            {title}
          </DialogTitle>
          <DialogDescription>{meta.label}</DialogDescription>
        </DialogHeader>
        {entry.note !== undefined && entry.note.trim().length > 0 ? (
          <p className="whitespace-pre-wrap rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-sm">
            {entry.note}
          </p>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            Ingen anteckning
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Stäng
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              onClear()
              onOpenChange(false)
            }}
          >
            Rensa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
