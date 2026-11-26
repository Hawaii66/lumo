import { Bookmark, Flame, GraduationCap, Lightbulb, Sigma } from "lucide-react"
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
} from "react"
import { StaticMath } from "~/components/lumo/static-math"
import {
  ChatInputMathChips,
  type ChatInputMathDraft,
} from "~/components/rooms/chat-input/math-chips"
import { ChatInputSlashTypeahead } from "~/components/rooms/chat-input/slash-typeahead"
import { ComposerTextarea } from "~/components/rooms/composer-textarea"
import { MathInputDialog } from "~/components/rooms/math-input-dialog"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import {
  composePromptWithMath,
  filterFormelSlashCommands,
  findSlashQueryAtCursor,
  insertMathRefToken,
  nextMathRef,
  removeAndRenumberMathRefs,
  splitTextWithInlineMath,
  type SlashCommand,
} from "~/lib/chat-composer"
import {
  PROBLEM_REASON_IDS,
  PROBLEM_REASON_NOTE_MAX,
  type ProblemReasonId,
} from "~/lib/problem-reasons"
import { cn } from "~/lib/utils"

const MAX_REASON_MATH_CHIPS = 4

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
  /** Tinted badge behind the sidebar icon. */
  badgeClassName: string
  activeButtonClassName: string
  chipClassName: string
}

export const REASON_META: Record<ProblemReasonId, ReasonMeta> = {
  hard: {
    id: "hard",
    label: "Svår",
    Icon: Flame,
    iconClassName: "text-rose-600!",
    badgeClassName: "bg-rose-500/20",
    activeButtonClassName:
      "border-rose-600/50 bg-rose-500/15 text-rose-700 hover:bg-rose-500/25",
    chipClassName: "border-rose-600/60 bg-rose-500/15 text-foreground",
  },
  insight: {
    id: "insight",
    label: "Bra insikt",
    Icon: Lightbulb,
    iconClassName: "text-amber-600!",
    badgeClassName: "bg-amber-500/20",
    activeButtonClassName:
      "border-amber-600/50 bg-amber-500/15 text-amber-800 hover:bg-amber-500/25",
    chipClassName: "border-amber-600/60 bg-amber-500/15 text-foreground",
  },
  teacher: {
    id: "teacher",
    label: "Behöver lärarhjälp",
    Icon: GraduationCap,
    iconClassName: "text-sky-600!",
    badgeClassName: "bg-sky-500/20",
    activeButtonClassName:
      "border-sky-600/50 bg-sky-500/15 text-sky-800 hover:bg-sky-500/25",
    chipClassName: "border-sky-600/60 bg-sky-500/15 text-foreground",
  },
  other: {
    id: "other",
    label: "Övrigt",
    Icon: Bookmark,
    iconClassName: "text-violet-600!",
    badgeClassName: "bg-violet-500/20",
    activeButtonClassName:
      "border-violet-600/50 bg-violet-500/15 text-violet-800 hover:bg-violet-500/25",
    chipClassName: "border-violet-600/60 bg-violet-500/15 text-foreground",
  },
}

type ProblemReasonDisplayProps = {
  entries: Array<ProblemReasonEntry>
  className?: string
  /** When set, icons are clickable (e.g. open detail modal). */
  onSelect?: (entry: ProblemReasonEntry) => void
}

function ReasonBadge({
  entry,
  onSelect,
}: {
  entry: ProblemReasonEntry
  onSelect?: (entry: ProblemReasonEntry) => void
}) {
  const meta = REASON_META[entry.reason]
  const Icon = meta.Icon
  const named = entry.letter !== ""
  const label = named ? `${entry.letter}: ${meta.label}` : meta.label

  return (
    <span
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-5 max-w-full shrink-0 items-center gap-0.5 rounded px-1",
        meta.badgeClassName,
        onSelect && "cursor-pointer hover:brightness-95",
      )}
      onClick={
        onSelect
          ? (event) => {
              event.stopPropagation()
              onSelect(entry)
            }
          : undefined
      }
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.key !== "Enter" && event.key !== " ") return
              event.preventDefault()
              event.stopPropagation()
              onSelect(entry)
            }
          : undefined
      }
    >
      {named ? (
        <span className="text-[10px] font-semibold leading-none text-foreground">
          {entry.letter}
        </span>
      ) : null}
      <Icon
        className={cn("size-3! shrink-0", meta.iconClassName)}
        aria-hidden
      />
    </span>
  )
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
        className={cn(
          "inline-flex shrink-0 items-center gap-0.5 overflow-visible!",
          className,
        )}
      >
        {letterEntries.map((entry) => (
          <ReasonBadge key={entry.letter} entry={entry} onSelect={onSelect} />
        ))}
      </span>
    )
  }

  const whole = entries.find((entry) => entry.letter === "")
  if (whole === undefined) return null

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center overflow-visible!",
        className,
      )}
    >
      <ReasonBadge entry={whole} onSelect={onSelect} />
    </span>
  )
}

type ProblemReasonControlProps = {
  entry: ProblemReasonEntry | undefined
  onSave: (reason: ProblemReasonId, note: string) => void
  onClear: () => void
  letter?: string
  className?: string
}

/** Toggle / edit control for the problem detail view. */
export function ProblemReasonControl({
  entry,
  onSave,
  onClear,
  letter,
  className,
}: ProblemReasonControlProps) {
  const [pickOpen, setPickOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const named = letter !== undefined && letter !== ""
  const scope = named ? `deluppgift (${letter})` : "uppgiften"
  const meta = entry ? REASON_META[entry.reason] : null
  const Icon = meta?.Icon ?? Bookmark
  const label = entry
    ? `Visa markering för ${scope}`
    : `Markera ${scope} att återkomma till`

  return (
    <>
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-pressed={entry !== undefined}
        onClick={() => {
          if (entry !== undefined) {
            setDetailOpen(true)
            return
          }
          setPickOpen(true)
        }}
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
        open={pickOpen}
        onOpenChange={setPickOpen}
        initial={entry}
        letter={letter}
        onSave={(reason, note) => {
          onSave(reason, note)
          setPickOpen(false)
        }}
      />
      <ProblemReasonDetailDialog
        entry={entry ?? null}
        open={detailOpen && entry !== undefined}
        onOpenChange={setDetailOpen}
        onClear={onClear}
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
  const [cursor, setCursor] = useState(0)
  const [typeaheadOpen, setTypeaheadOpen] = useState(false)
  const [typeaheadIndex, setTypeaheadIndex] = useState(0)
  const [mathDrafts, setMathDrafts] = useState<Array<ChatInputMathDraft>>([])
  const [mathDialogOpen, setMathDialogOpen] = useState(false)
  const [editingMathId, setEditingMathId] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const mathInsertCursorRef = useRef(0)

  useEffect(() => {
    if (!open) return
    setReason(initial?.reason ?? "hard")
    setNote(initial?.note ?? "")
    setCursor(0)
    setTypeaheadOpen(false)
    setTypeaheadIndex(0)
    setMathDrafts([])
    setMathDialogOpen(false)
    setEditingMathId(null)
  }, [open, initial])

  const slashQuery = useMemo(
    () => findSlashQueryAtCursor(note, cursor),
    [note, cursor],
  )
  const slashOptions = useMemo(
    () =>
      slashQuery ? filterFormelSlashCommands(slashQuery.query) : [],
    [slashQuery],
  )
  const showSlashTypeahead =
    typeaheadOpen && slashQuery !== null && slashOptions.length > 0
  const mathRefNumbers = useMemo(
    () => mathDrafts.map((draft) => draft.ref),
    [mathDrafts],
  )
  const editingDraft = editingMathId
    ? mathDrafts.find((draft) => draft.id === editingMathId)
    : undefined
  const mathFull = mathDrafts.length >= MAX_REASON_MATH_CHIPS

  useEffect(() => {
    if (!slashQuery) {
      setTypeaheadOpen(false)
      return
    }
    setTypeaheadOpen(true)
    setTypeaheadIndex(0)
  }, [slashQuery?.start, slashQuery?.query])

  useEffect(() => {
    if (!showSlashTypeahead) return
    optionRefs.current[typeaheadIndex]?.scrollIntoView({ block: "nearest" })
  }, [showSlashTypeahead, typeaheadIndex])

  const named = letter !== undefined && letter !== ""
  const title = named
    ? `Markera deluppgift (${letter})`
    : "Markera uppgiften"

  function handleOpenChange(next: boolean) {
    // Keep the pick dialog open while the nested math dialog is up.
    if (!next && mathDialogOpen) return
    onOpenChange(next)
  }

  function syncCursorFromTextarea() {
    const el = textareaRef.current
    if (!el) return
    setCursor(el.selectionStart)
  }

  function focusTextareaAt(pos: number) {
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(pos, pos)
      setCursor(pos)
    })
  }

  function stripSlashCommandFromNote(): number {
    if (!slashQuery) return cursor
    const before = note.slice(0, slashQuery.start)
    const after = note.slice(cursor)
    const next = `${before}${after}`
    setNote(next)
    const nextCursor = before.length
    setCursor(nextCursor)
    return nextCursor
  }

  function openMathDialog(editId?: string) {
    if (editId === undefined && mathFull) return
    setEditingMathId(editId ?? null)
    setTypeaheadOpen(false)
    setMathDialogOpen(true)
  }

  function openMathDialogAtCursor() {
    mathInsertCursorRef.current = cursor
    openMathDialog()
  }

  function runFormelCommand() {
    mathInsertCursorRef.current = stripSlashCommandFromNote()
    openMathDialog()
  }

  function handleMathConfirm(latex: string) {
    if (editingMathId) {
      setMathDrafts((current) =>
        current.map((draft) =>
          draft.id === editingMathId ? { ...draft, latex } : draft,
        ),
      )
      setEditingMathId(null)
      focusTextareaAt(cursor)
      return
    }

    const ref = nextMathRef(mathDrafts)
    setMathDrafts((current) => [
      ...current,
      { id: crypto.randomUUID(), ref, latex },
    ])
    let nextCursor = mathInsertCursorRef.current
    setNote((current) => {
      const inserted = insertMathRefToken(
        current,
        mathInsertCursorRef.current,
        ref,
      )
      const next =
        inserted.text.length > PROBLEM_REASON_NOTE_MAX
          ? inserted.text.slice(0, PROBLEM_REASON_NOTE_MAX)
          : inserted.text
      nextCursor = Math.min(inserted.cursor, next.length)
      mathInsertCursorRef.current = nextCursor
      return next
    })
    setEditingMathId(null)
    focusTextareaAt(nextCursor)
  }

  function removeMathDraft(draft: ChatInputMathDraft) {
    const { text, drafts } = removeAndRenumberMathRefs(
      note,
      mathDrafts,
      draft.id,
    )
    setNote(text)
    setMathDrafts(drafts)
  }

  function handleNoteKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (showSlashTypeahead) {
      if (event.key === "ArrowDown") {
        event.preventDefault()
        setTypeaheadIndex((i) =>
          i + 1 >= slashOptions.length ? 0 : i + 1,
        )
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        setTypeaheadIndex((i) =>
          i - 1 < 0 ? slashOptions.length - 1 : i - 1,
        )
        return
      }
      if (
        event.key === "Enter" ||
        event.key === "Tab" ||
        event.key === " "
      ) {
        const option = slashOptions[typeaheadIndex]
        if (option) {
          event.preventDefault()
          runFormelCommand()
          return
        }
      }
      if (event.key === "Escape") {
        event.preventDefault()
        setTypeaheadOpen(false)
        return
      }
    }

    // Exact `/formel` + Enter opens even if typeahead was dismissed.
    if (event.key === "Enter" && !event.shiftKey && slashQuery) {
      const exact = filterFormelSlashCommands(slashQuery.query)
      if (exact.length === 1 && exact[0]!.command === slashQuery.query) {
        event.preventDefault()
        runFormelCommand()
      }
    }
  }

  function selectSlashOption(_option: SlashCommand) {
    runFormelCommand()
  }

  function handleSave() {
    const composed = composePromptWithMath(note, mathDrafts)
    onSave(reason, composed.slice(0, PROBLEM_REASON_NOTE_MAX))
  }

  function handleMathDialogOpenChange(next: boolean) {
    setMathDialogOpen(next)
    if (!next) setEditingMathId(null)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
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
                        selected
                          ? meta.iconClassName
                          : "text-muted-foreground",
                      )}
                      aria-hidden
                    />
                    {meta.label}
                  </button>
                )
              })}
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="problem-reason-note"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Anteckning (valfritt)
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  disabled={mathFull}
                  onClick={openMathDialogAtCursor}
                >
                  <Sigma className="size-3.5" aria-hidden />
                  Formel
                </Button>
              </div>
              <ChatInputMathChips
                drafts={mathDrafts}
                onEdit={openMathDialog}
                onRemove={removeMathDraft}
              />
              <div className="relative">
                {showSlashTypeahead ? (
                  <ChatInputSlashTypeahead
                    options={slashOptions}
                    selectedIndex={typeaheadIndex}
                    optionRefs={optionRefs}
                    onSelect={selectSlashOption}
                  />
                ) : null}
                <ComposerTextarea
                  ref={textareaRef}
                  id="problem-reason-note"
                  value={note}
                  mathRefs={mathRefNumbers}
                  maxLength={PROBLEM_REASON_NOTE_MAX}
                  rows={3}
                  placeholder="Skriv något att komma ihåg… /formel"
                  onChange={(event) => {
                    setNote(event.target.value)
                    setCursor(event.target.selectionStart)
                  }}
                  onSelect={syncCursorFromTextarea}
                  onClick={syncCursorFromTextarea}
                  onKeyUp={syncCursorFromTextarea}
                  onKeyDown={handleNoteKeyDown}
                />
              </div>
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
            <Button type="button" onClick={handleSave}>
              Spara
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MathInputDialog
        open={mathDialogOpen}
        onOpenChange={handleMathDialogOpenChange}
        initialLatex={editingDraft?.latex ?? ""}
        onConfirm={handleMathConfirm}
        title={editingDraft ? "Redigera formel" : "Skriv formel"}
        confirmLabel={editingDraft ? "Spara" : "Lägg till"}
      />
    </>
  )
}

function ReasonNoteText({ note }: { note: string }) {
  const segments = splitTextWithInlineMath(note)
  return (
    <div className="whitespace-pre-wrap rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-sm">
      {segments.map((segment, index) => {
        if (segment.type === "math") {
          return (
            <StaticMath
              key={`math-${index}`}
              latex={segment.value}
              display="inline"
              className="mx-0.5 align-middle"
            />
          )
        }
        if (!segment.value) return null
        return <span key={`text-${index}`}>{segment.value}</span>
      })}
    </div>
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
          <ReasonNoteText note={entry.note} />
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
