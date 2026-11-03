import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { FormEvent, KeyboardEvent, RefObject } from "react"
import type { Id } from "../../../../convex/_generated/dataModel"
import type { ChatFilePickerSelectedFile } from "~/components/rooms/chat-file-picker-dialog"
import type { ChatInputMathDraft } from "./math-chips"
import type {
  ChatInputCitation,
  ChatInputHandle,
  ChatInputImage,
  ChatInputStorageImage,
  ChatInputSubmitPayload,
  RoomProblemGroup,
} from "./types"
import {
  appendUserTextToPrompt,
  composePromptWithMath,
  fileSlugFromName,
  filterProblemOptions,
  filterSlashCommands,
  findAllMentions,
  findMentionQueryAtCursor,
  findSlashQueryAtCursor,
  formatCitationBody,
  formatMathRef,
  formatProblemMention,
  insertCitationAtCursor,
  insertMathRefToken,
  nextMathRef,
  removeAndRenumberMathRefs,
  resolveDraftMentions,
  type ProblemMentionOption,
  type ResolvedDraftMention,
  type SlashCommand,
} from "~/lib/chat-composer"
import { CHAT_MODES, type ChatMode } from "~/lib/chat-mode"

const MAX_IMAGES = 4
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_MATH_CHIPS = 4

export type UseChatInputComposerArgs = {
  problemGroups: Array<RoomProblemGroup> | undefined
  onSubmit: (payload: ChatInputSubmitPayload) => Promise<void> | void
  pending?: boolean
  error?: string | null
  defaultProblemId?: Id<"problems">
  mode?: ChatMode
  onModeChange?: (mode: ChatMode) => void | Promise<void>
  focusSignal?: number
}

export function useChatInputComposer({
  problemGroups,
  onSubmit,
  pending = false,
  error = null,
  defaultProblemId,
  mode,
  onModeChange,
  focusSignal,
}: UseChatInputComposerArgs) {
  const [prompt, setPrompt] = useState("")
  const [pendingImages, setPendingImages] = useState<Array<ChatInputImage>>([])
  const [pendingStorageImages, setPendingStorageImages] = useState<
    Array<ChatInputStorageImage>
  >([])
  const [mathDrafts, setMathDrafts] = useState<Array<ChatInputMathDraft>>([])
  const [mathDialogOpen, setMathDialogOpen] = useState(false)
  const [editingMathId, setEditingMathId] = useState<string | null>(null)
  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  const [modeMenuIndex, setModeMenuIndex] = useState(0)
  const [draftMode, setDraftMode] = useState<ChatMode | undefined>(undefined)
  const [filePickerOpen, setFilePickerOpen] = useState(false)
  const [phoneScanOpen, setPhoneScanOpen] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [cursor, setCursor] = useState(0)
  const [typeaheadIndex, setTypeaheadIndex] = useState(0)
  const [typeaheadOpen, setTypeaheadOpen] = useState(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const typeaheadOptionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const modeOptionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const mathInsertCursorRef = useRef(0)
  const pendingImagesRef = useRef(pendingImages)
  pendingImagesRef.current = pendingImages
  const pendingStorageImagesRef = useRef(pendingStorageImages)
  pendingStorageImagesRef.current = pendingStorageImages

  const activeMode = mode ?? draftMode
  const attachedImageCount =
    pendingImages.length + pendingStorageImages.length
  const imagesFull = attachedImageCount >= MAX_IMAGES

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
        for (const shadow of problem.shadows) {
          options.push({
            id: shadow.id,
            problemNumber: shadow.problemNumber,
            fileName: group.fileName,
          })
        }
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

  useEffect(() => {
    if (!modeMenuOpen) return
    const selectedIndex = CHAT_MODES.findIndex(
      (item) => item.value === activeMode,
    )
    setModeMenuIndex(selectedIndex >= 0 ? selectedIndex : 0)
  }, [modeMenuOpen, activeMode])

  useEffect(() => {
    if (!modeMenuOpen) return
    modeOptionRefs.current[modeMenuIndex]?.scrollIntoView({
      block: "nearest",
    })
  }, [modeMenuOpen, modeMenuIndex])

  const displayError = localError ?? error
  const hasMath = mathDrafts.some((draft) => draft.latex.trim().length > 0)
  const canSend =
    (prompt.trim().length > 0 ||
      pendingImages.length > 0 ||
      pendingStorageImages.length > 0 ||
      hasMath) &&
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

  useEffect(() => {
    if (focusSignal === undefined || focusSignal < 1) return
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
  }, [focusSignal])

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

  function openModeMenu() {
    setModeMenuOpen(true)
    setTypeaheadOpen(false)
    setLocalError(null)
  }

  async function selectMode(next: ChatMode) {
    setModeMenuOpen(false)
    setDraftMode(next)
    setLocalError(null)
    if (onModeChange) {
      try {
        await onModeChange(next)
      } catch (err: unknown) {
        setLocalError(
          err instanceof Error ? err.message : "Kunde inte byta läge",
        )
      }
    }
    focusTextareaAt(cursor)
  }

  function runSlashCommand(command: SlashCommand) {
    setTypeaheadOpen(false)
    if (command.id === "formel") {
      stripSlashCommandFromPrompt()
      openMathDialog()
      return
    }
    if (command.id === "mode") {
      stripSlashCommandFromPrompt()
      openModeMenu()
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

  function removeMathDraft(draft: ChatInputMathDraft) {
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
      const remaining =
        MAX_IMAGES - (current.length + pendingStorageImagesRef.current.length)
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
  }

  function addStorageFile(file: ChatFilePickerSelectedFile) {
    setLocalError(null)
    setPendingStorageImages((current) => {
      if (current.some((image) => image.storageId === file.storageId)) {
        return current
      }
      const total = current.length + pendingImagesRef.current.length
      if (total >= MAX_IMAGES) {
        setLocalError(`Du kan bifoga högst ${MAX_IMAGES} bilder`)
        return current
      }
      return [
        ...current,
        {
          id: crypto.randomUUID(),
          storageId: file.storageId,
          filename: file.filename,
        },
      ]
    })
  }

  const attachedStorageIds = useMemo(() => {
    return new Set(pendingStorageImages.map((image) => image.storageId))
  }, [pendingStorageImages])

  function removeImage(id: string) {
    setPendingImages((current) => {
      const target = current.find((image) => image.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return current.filter((image) => image.id !== id)
    })
  }

  function removeStorageImage(id: string) {
    setPendingStorageImages((current) =>
      current.filter((item) => item.id !== id),
    )
  }

  function insertMention(option: ProblemMentionOption) {
    if (!mentionQuery) return
    const insertion = formatProblemMention(
      option.problemNumber,
      option.fileName,
    )
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

    if (modeMenuOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault()
        setModeMenuIndex((i) => (i + 1 >= CHAT_MODES.length ? 0 : i + 1))
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        setModeMenuIndex((i) =>
          i - 1 < 0 ? CHAT_MODES.length - 1 : i - 1,
        )
        return
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const option = CHAT_MODES[modeMenuIndex]
        if (option) {
          event.preventDefault()
          void selectMode(option.value)
          return
        }
      }
      if (event.key === "Escape") {
        event.preventDefault()
        setModeMenuOpen(false)
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

    // Exact `/läge` or `/formel` + Enter opens even if typeahead was dismissed.
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

  async function sendPromptText(
    composed: string,
    options?: {
      mode?: ChatMode
      extraStorageImages?: Array<{
        storageId: Id<"_storage">
        filename: string
      }>
      subproblemLetter?: string
    },
  ) {
    const extraStorage = (options?.extraStorageImages ?? []).map((image) => ({
      id: crypto.randomUUID(),
      storageId: image.storageId,
      filename: image.filename,
    }))
    const storageForSend = [...pendingStorageImages, ...extraStorage]

    if (
      (!composed && pendingImages.length === 0 && storageForSend.length === 0) ||
      pending
    ) {
      return
    }

    let promptToSend = composed
    // Ensure default problem appears as an @mention so it renders in the chat.
    if (defaultProblemId) {
      const defaultOption = problemOptions.find(
        (option) => option.id === defaultProblemId,
      )
      if (defaultOption) {
        const defaultSlug = fileSlugFromName(defaultOption.fileName)
        const alreadyMentioned = findAllMentions(promptToSend).some(
          (mention) => {
            if (
              mention.number.toLowerCase() !==
              defaultOption.problemNumber.toLowerCase()
            ) {
              return false
            }
            if (mention.fileSlug === undefined) return true
            return mention.fileSlug.toLowerCase() === defaultSlug.toLowerCase()
          },
        )
        if (!alreadyMentioned) {
          promptToSend = appendUserTextToPrompt(
            formatProblemMention(
              defaultOption.problemNumber,
              defaultOption.fileName,
            ),
            promptToSend,
          )
        }
      }
    }

    const mentions = resolveDraftMentions(promptToSend, problemOptions)
    const ambiguous = mentions.find((m) => m.status === "ambiguous")
    if (ambiguous) {
      const label = ambiguous.fileSlug
        ? `@${ambiguous.problemNumber}-${ambiguous.fileSlug}`
        : `@${ambiguous.problemNumber}`
      setLocalError(
        `Flera uppgifter matchar ${label}. Välj en i listan (@).`,
      )
      return
    }

    const resolvedIds = mentions
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
    const storageImagesToSend = storageForSend
    const promptSnapshot = prompt
    const mathSnapshot = mathDrafts
    const storageSnapshot = pendingStorageImages
    setLocalError(null)
    setPrompt("")
    setMathDrafts([])
    setPendingImages([])
    setPendingStorageImages([])

    try {
      await onSubmit({
        prompt: promptToSend,
        images: imagesToSend,
        storageImages:
          storageImagesToSend.length > 0
            ? storageImagesToSend.map((image) => ({
                storageId: image.storageId,
                filename: image.filename,
              }))
            : undefined,
        mode: options?.mode ?? draftMode,
        problemId: problemIds?.[0],
        problemIds,
        subproblemLetter: options?.subproblemLetter,
      })
      for (const image of imagesToSend) {
        URL.revokeObjectURL(image.previewUrl)
      }
    } catch {
      setPrompt(promptSnapshot)
      setMathDrafts(mathSnapshot)
      setPendingImages(imagesToSend)
      setPendingStorageImages(storageSnapshot)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    await sendPromptText(composePromptWithMath(prompt, mathDrafts))
  }

  function insertCitation(citation: ChatInputCitation) {
    const latex = citation.latex?.trim()
    const text = citation.text?.trim()
    if (!latex && !text) return

    const insertAt = textareaRef.current?.selectionStart ?? cursor

    if (latex) {
      if (mathDrafts.length < MAX_MATH_CHIPS) {
        const ref = nextMathRef(mathDrafts)
        setMathDrafts((current) => [
          ...current,
          { id: crypto.randomUUID(), ref, latex },
        ])
        setPrompt((current) => {
          const inserted = insertCitationAtCursor(
            current,
            insertAt,
            formatCitationBody(
              citation.responseNumber,
              formatMathRef(ref),
            ),
          )
          focusTextareaAt(inserted.cursor)
          return inserted.text
        })
        return
      }

      // Chips full — fall back to inline $latex$ inside the same cite shape.
      setPrompt((current) => {
        const inserted = insertCitationAtCursor(
          current,
          insertAt,
          formatCitationBody(citation.responseNumber, `$${latex}$`),
        )
        focusTextareaAt(inserted.cursor)
        return inserted.text
      })
      return
    }

    setPrompt((current) => {
      const inserted = insertCitationAtCursor(
        current,
        insertAt,
        formatCitationBody(citation.responseNumber, text!),
      )
      focusTextareaAt(inserted.cursor)
      return inserted.text
    })
  }

  const handle: ChatInputHandle = {
    async submitStartDraft(draft) {
      const userText = composePromptWithMath(prompt, mathDrafts)
      const combined = appendUserTextToPrompt(draft.prompt, userText)
      await sendPromptText(combined, {
        mode: draft.mode,
        extraStorageImages: draft.storageImages,
        subproblemLetter: draft.subproblemLetter,
      })
    },
    insertCitation,
  }

  function handlePromptChange(value: string, selectionStart: number) {
    setPrompt(value)
    setCursor(selectionStart)
  }

  function handleCursorChange(selectionStart: number) {
    setCursor(selectionStart)
  }

  function handleMathDialogOpenChange(open: boolean) {
    setMathDialogOpen(open)
    if (!open) setEditingMathId(null)
  }

  function handlePasteImages(files: FileList) {
    if (files.length === 0) return false
    const hasImage = Array.from(files).some((file) =>
      file.type.startsWith("image/"),
    )
    if (!hasImage) return false
    addImages(files)
    return true
  }

  return {
    pending,
    prompt,
    pendingImages,
    pendingStorageImages,
    mathDrafts,
    mathDialogOpen,
    modeMenuOpen,
    filePickerOpen,
    setFilePickerOpen,
    phoneScanOpen,
    setPhoneScanOpen,
    activeMode,
    imagesFull,
    mathFull: mathDrafts.length >= MAX_MATH_CHIPS,
    draftMentions,
    typeaheadOptions,
    slashOptions,
    showMentionTypeahead,
    showSlashTypeahead,
    typeaheadIndex,
    modeMenuIndex,
    displayError,
    canSend,
    editingDraft,
    mathRefNumbers,
    attachedStorageIds,
    textareaRef,
    typeaheadOptionRefs: typeaheadOptionRefs as RefObject<
      Array<HTMLButtonElement | null>
    >,
    modeOptionRefs: modeOptionRefs as RefObject<
      Array<HTMLButtonElement | null>
    >,
    handle,
    openMathDialog,
    openMathDialogAtCursor,
    selectMode,
    runSlashCommand,
    handleMathConfirm,
    removeMathDraft,
    addImages,
    addStorageFile,
    removeImage,
    removeStorageImage,
    insertMention,
    handleTextareaKeyDown,
    handleSubmit,
    handlePromptChange,
    handleCursorChange,
    handleMathDialogOpenChange,
    handlePasteImages,
  }
}
