import { useQuery } from "convex/react"
import { ImagePlus, Sigma, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent, KeyboardEvent } from "react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { StaticMath } from "~/components/lumo/static-math"
import { ComposerTextarea } from "~/components/rooms/composer-textarea"
import { MathInputDialog } from "~/components/rooms/math-input-dialog"
import { MentionedProblems } from "~/components/rooms/mentioned-problems"
import { Button } from "~/components/ui/button"
import {
  composePromptWithMath,
  filterProblemOptions,
  filterSlashCommands,
  findMentionQueryAtCursor,
  findSlashQueryAtCursor,
  formatMathRef,
  insertMathRefToken,
  nextMathRef,
  removeAndRenumberMathRefs,
  resolveDraftMentions,
  TYPEAHEAD_VISIBLE_COUNT,
  type MathRefDraft,
  type ProblemMentionOption,
  type ResolvedDraftMention,
  type SlashCommand,
} from "~/lib/chat-composer"
import type { HelpLevel } from "~/lib/schemas"
import { useUiStore } from "~/stores/ui-store"
import { cn } from "~/lib/utils"

export type ChatInputImage = {
  id: string
  file: File
  previewUrl: string
}

export type ChatInputSubmitPayload = {
  prompt: string
  images: Array<ChatInputImage>
  helpLevel: HelpLevel
  problemId?: Id<"problems">
  problemIds?: Array<Id<"problems">>
}

type MathDraft = MathRefDraft & {
  id: string
}

type ChatInputProps = {
  roomId: Id<"rooms">
  onSubmit: (payload: ChatInputSubmitPayload) => Promise<void> | void
  pending?: boolean
  error?: string | null
  placeholder?: string
  className?: string
  showHelpLevels?: boolean
  /** When set (e.g. problem detail view), used if the prompt has no @mention. */
  defaultProblemId?: Id<"problems">
}

const MAX_IMAGES = 4
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_MATH_CHIPS = 4

const HELP_LEVELS: Array<{ value: HelpLevel; label: string }> = [
  { value: "minimal", label: "Hitta fel" },
  { value: "explain", label: "Förklara" },
  { value: "solve", label: "Lös helt" },
]

export function ChatInput({
  roomId,
  onSubmit,
  pending = false,
  error = null,
  placeholder = "Skriv ett meddelande… @1.2 eller /formel",
  className,
  showHelpLevels = true,
  defaultProblemId,
}: ChatInputProps) {
  const helpLevel = useUiStore((s) => s.helpLevel)
  const setHelpLevel = useUiStore((s) => s.setHelpLevel)

  const [prompt, setPrompt] = useState("")
  const [pendingImages, setPendingImages] = useState<Array<ChatInputImage>>([])
  const [mathDrafts, setMathDrafts] = useState<Array<MathDraft>>([])
  const [mathDialogOpen, setMathDialogOpen] = useState(false)
  const [editingMathId, setEditingMathId] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [cursor, setCursor] = useState(0)
  const [typeaheadIndex, setTypeaheadIndex] = useState(0)
  const [typeaheadOpen, setTypeaheadOpen] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const typeaheadOptionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const mathInsertCursorRef = useRef(0)
  const pendingImagesRef = useRef(pendingImages)
  pendingImagesRef.current = pendingImages

  const problemGroups = useQuery(api.PDFParse.problems.listGroupedByRoom, {
    roomId,
  })

  const problemOptions = useMemo((): Array<ProblemMentionOption> => {
    if (!problemGroups) return []
    const options: Array<ProblemMentionOption> = []
    for (const group of problemGroups) {
      for (const problem of group.problems) {
        options.push({
          id: problem.id,
          problemNumber: problem.problemNumber,
          fileName: group.fileName,
        })
      }
    }
    return options
  }, [problemGroups])

  const draftMentions = useMemo(
    () => resolveDraftMentions(prompt, problemOptions),
    [prompt, problemOptions],
  )

  const mentionQuery = useMemo(
    () => findMentionQueryAtCursor(prompt, cursor),
    [prompt, cursor],
  )

  const slashQuery = useMemo(
    () => findSlashQueryAtCursor(prompt, cursor),
    [prompt, cursor],
  )

  const typeaheadOptions = useMemo(() => {
    if (!mentionQuery) return []
    return filterProblemOptions(problemOptions, mentionQuery.query)
  }, [mentionQuery, problemOptions])

  const slashOptions = useMemo(() => {
    if (!slashQuery || mentionQuery) return []
    return filterSlashCommands(slashQuery.query)
  }, [slashQuery, mentionQuery])

  const showMentionTypeahead =
    typeaheadOpen && mentionQuery !== null && typeaheadOptions.length > 0
  const showSlashTypeahead =
    typeaheadOpen && slashQuery !== null && slashOptions.length > 0
  const showTypeahead = showMentionTypeahead || showSlashTypeahead

  useEffect(() => {
    setTypeaheadIndex(0)
    setTypeaheadOpen(true)
  }, [
    mentionQuery?.query,
    mentionQuery?.start,
    slashQuery?.query,
    slashQuery?.start,
  ])

  useEffect(() => {
    if (!showTypeahead) return
    typeaheadOptionRefs.current[typeaheadIndex]?.scrollIntoView({
      block: "nearest",
    })
  }, [
    typeaheadIndex,
    showTypeahead,
    typeaheadOptions.length,
    slashOptions.length,
  ])

  const displayError = localError ?? error
  const hasMath = mathDrafts.some((draft) => draft.latex.trim().length > 0)
  const canSend =
    (prompt.trim().length > 0 || pendingImages.length > 0 || hasMath) &&
    !pending

  const editingDraft = editingMathId
    ? mathDrafts.find((draft) => draft.id === editingMathId)
    : undefined

  const mathRefNumbers = useMemo(
    () => mathDrafts.map((draft) => draft.ref),
    [mathDrafts],
  )

  useEffect(() => {
    return () => {
      for (const image of pendingImagesRef.current) {
        URL.revokeObjectURL(image.previewUrl)
      }
    }
  }, [])

  function openMathDialog(editId?: string) {
    if (editId === undefined && mathDrafts.length >= MAX_MATH_CHIPS) {
      setLocalError(`Du kan lägga till högst ${MAX_MATH_CHIPS} formler`)
      return
    }
    setLocalError(null)
    setEditingMathId(editId ?? null)
    setMathDialogOpen(true)
  }

  function openMathDialogAtCursor() {
    mathInsertCursorRef.current = cursor
    openMathDialog()
  }

  function stripSlashCommandFromPrompt() {
    if (!slashQuery) return
    const before = prompt.slice(0, slashQuery.start)
    const after = prompt.slice(cursor)
    const next = `${before}${after}`.replace(/\s{2,}/g, " ")
    setPrompt(next)
    const nextCursor = before.length
    setCursor(nextCursor)
    mathInsertCursorRef.current = nextCursor
  }

  function runSlashCommand(command: SlashCommand) {
    stripSlashCommandFromPrompt()
    setTypeaheadOpen(false)
    if (command.id === "formel") {
      openMathDialog()
    }
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
    setPrompt((current) => {
      const inserted = insertMathRefToken(
        current,
        mathInsertCursorRef.current,
        ref,
      )
      mathInsertCursorRef.current = inserted.cursor
      focusTextareaAt(inserted.cursor)
      return inserted.text
    })
    setEditingMathId(null)
  }

  function removeMathDraft(draft: MathDraft) {
    const { text, drafts } = removeAndRenumberMathRefs(
      prompt,
      mathDrafts,
      draft.id,
    )
    setPrompt(text)
    setMathDrafts(drafts)
  }

  function addImages(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return

    setLocalError(null)
    const next: Array<ChatInputImage> = []
    for (const file of Array.from(fileList)) {
      if (!file.type.startsWith("image/")) {
        setLocalError("Endast bilder kan skickas just nu")
        continue
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setLocalError("Bilden är för stor (max 10 MB)")
        continue
      }
      next.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      })
    }

    setPendingImages((current) => {
      const remaining = MAX_IMAGES - current.length
      if (remaining <= 0) {
        for (const image of next) URL.revokeObjectURL(image.previewUrl)
        setLocalError(`Du kan bifoga högst ${MAX_IMAGES} bilder`)
        return current
      }
      if (next.length > remaining) {
        for (const image of next.slice(remaining)) {
          URL.revokeObjectURL(image.previewUrl)
        }
        setLocalError(`Du kan bifoga högst ${MAX_IMAGES} bilder`)
        return [...current, ...next.slice(0, remaining)]
      }
      return [...current, ...next]
    })

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  function removeImage(id: string) {
    setPendingImages((current) => {
      const target = current.find((image) => image.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return current.filter((image) => image.id !== id)
    })
  }

  function insertMention(option: ProblemMentionOption) {
    if (!mentionQuery) return
    const insertion = `@${option.problemNumber}`
    const before = prompt.slice(0, mentionQuery.start)
    const after = prompt.slice(cursor)
    const next = `${before}${insertion}${after.startsWith(" ") ? after : ` ${after}`}`
    const nextCursor = before.length + insertion.length + 1
    setPrompt(next)
    setCursor(nextCursor)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(nextCursor, nextCursor)
    })
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (showMentionTypeahead) {
      if (event.key === "ArrowDown") {
        event.preventDefault()
        setTypeaheadIndex((i) =>
          i + 1 >= typeaheadOptions.length ? 0 : i + 1,
        )
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        setTypeaheadIndex((i) =>
          i - 1 < 0 ? typeaheadOptions.length - 1 : i - 1,
        )
        return
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const option = typeaheadOptions[typeaheadIndex]
        if (option) {
          event.preventDefault()
          insertMention(option)
          return
        }
      }
      if (event.key === "Escape") {
        event.preventDefault()
        setTypeaheadOpen(false)
        return
      }
    }

    if (showSlashTypeahead) {
      if (event.key === "ArrowDown") {
        event.preventDefault()
        setTypeaheadIndex((i) => (i + 1 >= slashOptions.length ? 0 : i + 1))
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
          runSlashCommand(option)
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
      const exact = filterSlashCommands(slashQuery.query)
      if (exact.length === 1 && exact[0]!.command === slashQuery.query) {
        event.preventDefault()
        runSlashCommand(exact[0]!)
        return
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const composed = composePromptWithMath(prompt, mathDrafts)
    if ((!composed && pendingImages.length === 0) || pending) return

    const ambiguous = draftMentions.find((m) => m.status === "ambiguous")
    if (ambiguous) {
      setLocalError(
        `Flera uppgifter heter ${ambiguous.problemNumber}. Välj en i listan (@).`,
      )
      return
    }

    const resolvedIds = draftMentions
      .filter(
        (m): m is Extract<ResolvedDraftMention, { status: "resolved" }> =>
          m.status === "resolved",
      )
      .map((m) => m.problemId as Id<"problems">)

    const problemIds =
      resolvedIds.length > 0
        ? resolvedIds
        : defaultProblemId
          ? [defaultProblemId]
          : undefined

    const imagesToSend = pendingImages
    const promptSnapshot = prompt
    const mathSnapshot = mathDrafts
    setLocalError(null)
    setPrompt("")
    setMathDrafts([])
    setPendingImages([])

    try {
      await onSubmit({
        prompt: composed,
        images: imagesToSend,
        helpLevel,
        problemId: problemIds?.[0],
        problemIds,
      })
      for (const image of imagesToSend) {
        URL.revokeObjectURL(image.previewUrl)
      }
    } catch {
      setPrompt(promptSnapshot)
      setMathDrafts(mathSnapshot)
      setPendingImages(imagesToSend)
    }
  }

  return (
    <div className={cn("flex flex-col gap-2 border-t border-border pt-4", className)}>
      {draftMentions.length > 0 ? (
        <div className="max-h-56 overflow-y-auto">
          <MentionedProblems
            roomId={roomId}
            mentions={draftMentions}
            draft
          />
        </div>
      ) : null}

    <form
      onSubmit={(event) => {
        void handleSubmit(event)
      }}
      className="flex flex-col gap-2"
      onPaste={(event) => {
        const files = event.clipboardData.files
        if (files.length === 0) return
        const hasImage = Array.from(files).some((file) =>
          file.type.startsWith("image/"),
        )
        if (hasImage) {
          event.preventDefault()
          addImages(files)
        }
      }}
    >
      {displayError ? (
        <p className="text-sm text-destructive">{displayError}</p>
      ) : null}

      {pendingImages.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {pendingImages.map((image) => (
            <li
              key={image.id}
              className="relative size-16 overflow-hidden rounded-md border border-border"
            >
              <img
                src={image.previewUrl}
                alt={image.file.name}
                className="size-full object-cover"
              />
              <button
                type="button"
                className="absolute top-0.5 right-0.5 rounded-full bg-background/90 p-0.5 text-foreground shadow-sm"
                onClick={() => removeImage(image.id)}
                aria-label={`Ta bort ${image.file.name}`}
                disabled={pending}
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {mathDrafts.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {mathDrafts.map((draft) => (
            <li key={draft.id} className="relative max-w-full">
              <button
                type="button"
                className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 pr-8 text-left hover:bg-muted/70"
                onClick={() => openMathDialog(draft.id)}
                disabled={pending}
              >
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {formatMathRef(draft.ref)}
                </span>
                <StaticMath latex={draft.latex} display="inline" />
              </button>
              <button
                type="button"
                className="absolute top-1 right-1 rounded-full bg-background/90 p-0.5 text-foreground shadow-sm"
                onClick={() => removeMathDraft(draft)}
                aria-label={`Ta bort formel ${formatMathRef(draft.ref)}`}
                disabled={pending}
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {showHelpLevels ? (
        <div className="flex flex-wrap gap-1.5">
          {HELP_LEVELS.map((level) => (
            <Button
              key={level.value}
              type="button"
              size="sm"
              variant={helpLevel === level.value ? "default" : "outline"}
              disabled={pending}
              onClick={() => setHelpLevel(level.value)}
            >
              {level.label}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="relative">
        <ComposerTextarea
          ref={textareaRef}
          value={prompt}
          mathRefs={mathRefNumbers}
          onChange={(e) => {
            setPrompt(e.target.value)
            setCursor(e.target.selectionStart)
          }}
          onClick={(e) => setCursor(e.currentTarget.selectionStart)}
          onKeyUp={(e) => setCursor(e.currentTarget.selectionStart)}
          onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
          placeholder={placeholder}
          rows={2}
          disabled={pending}
          onKeyDown={handleTextareaKeyDown}
        />
        {showMentionTypeahead ? (
          <ul
            className="absolute bottom-full left-0 z-20 mb-1 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
            style={{ maxHeight: `calc(${TYPEAHEAD_VISIBLE_COUNT} * 3.25rem)` }}
            role="listbox"
          >
            {typeaheadOptions.map((option, index) => (
              <li key={`${option.id}-${option.fileName}`}>
                <button
                  type="button"
                  ref={(el) => {
                    typeaheadOptionRefs.current[index] = el
                  }}
                  role="option"
                  aria-selected={index === typeaheadIndex}
                  className={cn(
                    "flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left text-sm",
                    index === typeaheadIndex
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted",
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    insertMention(option)
                  }}
                >
                  <span className="font-medium">@{option.problemNumber}</span>
                  <span className="text-xs text-muted-foreground">
                    {option.fileName}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {showSlashTypeahead ? (
          <ul
            className="absolute bottom-full left-0 z-20 mb-1 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
            role="listbox"
          >
            {slashOptions.map((option, index) => (
              <li key={option.id}>
                <button
                  type="button"
                  ref={(el) => {
                    typeaheadOptionRefs.current[index] = el
                  }}
                  role="option"
                  aria-selected={index === typeaheadIndex}
                  className={cn(
                    "flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left text-sm",
                    index === typeaheadIndex
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted",
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    runSlashCommand(option)
                  }}
                >
                  <span className="font-medium">{option.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={pending}
            onChange={(event) => {
              addImages(event.target.files)
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || pendingImages.length >= MAX_IMAGES}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus />
            Bild
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || mathDrafts.length >= MAX_MATH_CHIPS}
            onClick={openMathDialogAtCursor}
          >
            <Sigma />
            Formel
          </Button>
        </div>
        <Button type="submit" disabled={!canSend}>
          {pending ? "Skickar…" : "Skicka"}
        </Button>
      </div>
    </form>

      <MathInputDialog
        open={mathDialogOpen}
        onOpenChange={(open) => {
          setMathDialogOpen(open)
          if (!open) setEditingMathId(null)
        }}
        initialLatex={editingDraft?.latex ?? ""}
        onConfirm={handleMathConfirm}
        title={editingDraft ? "Redigera formel" : "Skriv formel"}
        confirmLabel={editingDraft ? "Spara" : "Lägg till"}
      />
    </div>
  )
}
