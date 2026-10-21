import {
  optimisticallySendMessage,
  useSmoothText,
  useUIMessages,
} from "@convex-dev/agent/react"
import { useMutation, useQuery } from "convex/react"
import { Check, Copy, Pencil } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { api } from "../../../convex/_generated/api"
import type { UIMessage } from "@convex-dev/agent/react"
import type { Id } from "../../../convex/_generated/dataModel"
import {
  ChatInput,
  type ChatInputSubmitPayload,
} from "~/components/rooms/chat-input"
import { ChatDeletionExpiryPicker } from "~/components/rooms/chat-deletion-expiry-picker"
import { ChatModePicker } from "~/components/rooms/chat-mode-picker"
import {
  ChapterSelector,
  type ChapterItem,
} from "~/components/rooms/chapter-selector"
import { MentionedProblems } from "~/components/rooms/mentioned-problems"
import { UserMessageText } from "~/components/rooms/user-message-text"
import { LumoParts } from "~/components/lumo/lumo-parts"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import {
  DEFAULT_CHAT_DELETION_EXPIRY,
  type ChatDeletionExpiry,
} from "~/lib/chat-deletion-expiry"
import {
  resolveDraftMentions,
  type ProblemMentionOption,
  type ResolvedDraftMention,
} from "~/lib/chat-composer"
import {
  DEFAULT_CHAT_MODE,
  type ChatMode,
} from "~/lib/chat-mode"
import {
  parseLumoDocument,
  subproblemAnchorId,
  type LumoDocument,
} from "~/lib/lumo-content"
import { uploadFileToStorage } from "~/lib/upload"
import { cn } from "~/lib/utils"

function documentHasVisibleParts(doc: LumoDocument): boolean {
  return doc.parts.some(
    (part) =>
      (part.type === "text" && part.content.trim().length > 0) ||
      part.type !== "text",
  )
}

function chaptersFromDocument(doc: LumoDocument | null): Array<ChapterItem> {
  if (!doc) return []
  const chapters: Array<ChapterItem> = []
  for (let partIndex = 0; partIndex < doc.parts.length; partIndex++) {
    const part = doc.parts[partIndex]
    if (part?.type === "subproblem") {
      chapters.push({ partIndex, label: part.label })
    }
  }
  return chapters
}

const MAX_TITLE_LENGTH = 80

type ThreadChatProps = {
  roomId: Id<"rooms">
  threadId: string
  title: string
  mode?: ChatMode
  deletionExpiry?: ChatDeletionExpiry
  deleteAt?: number | null
  mentionedProblemNumbers?: string[]
  onArchived?: () => void
  /** Increment to focus the composer (e.g. after starting a new chat). */
  composerFocusSignal?: number
}

function collectThreadMentions(
  messages: Array<UIMessage>,
  problemOptions: Array<ProblemMentionOption>,
  mentionedProblemNumbers: string[],
): Array<ResolvedDraftMention> {
  const byKey = new Map<string, ResolvedDraftMention>()

  function addFromText(text: string) {
    for (const mention of resolveDraftMentions(text, problemOptions)) {
      const key =
        mention.status === "resolved"
          ? `id:${mention.problemId}`
          : `num:${mention.problemNumber.toLowerCase()}`
      if (!byKey.has(key)) byKey.set(key, mention)
    }
  }

  for (const message of messages) {
    if (message.role !== "user") continue
    const text = messageText(message)
    if (text) addFromText(text)
  }

  for (const problemNumber of mentionedProblemNumbers) {
    const already = [...byKey.values()].some(
      (mention) =>
        mention.problemNumber.toLowerCase() === problemNumber.toLowerCase(),
    )
    if (!already) addFromText(`@${problemNumber}`)
  }

  return [...byKey.values()]
}

function messageText(message: UIMessage): string {
  return (
    message.text ||
    message.parts
      .filter(
        (part): part is { type: "text"; text: string } => part.type === "text",
      )
      .map((part) => part.text)
      .join("\n")
  )
}

function formatRawAssistantJson(messages: Array<UIMessage>): string | null {
  const assistantTexts = messages
    .filter((message) => message.role === "assistant")
    .map((message) => messageText(message))
    .filter((text) => text.length > 0)
  if (assistantTexts.length === 0) return null

  const pretty = assistantTexts.map((text) => {
    try {
      return JSON.parse(text) as unknown
    } catch {
      return text
    }
  })

  return JSON.stringify(pretty.length === 1 ? pretty[0] : pretty, null, 2)
}

function CopyRawJsonButton({ messages }: { messages: Array<UIMessage> }) {
  const [copied, setCopied] = useState(false)
  const raw = useMemo(() => formatRawAssistantJson(messages), [messages])

  async function handleCopy() {
    if (!raw) return
    try {
      await navigator.clipboard.writeText(raw)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard may be denied; ignore.
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="size-7 shrink-0 px-0"
      title="Kopiera rå JSON"
      disabled={!raw}
      onClick={() => {
        void handleCopy()
      }}
    >
      {copied ? (
        <Check className="size-3.5" />
      ) : (
        <Copy className="size-3.5" />
      )}
      <span className="sr-only">Kopiera rå JSON</span>
    </Button>
  )
}

function StreamingIndicator({ empty }: { empty?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        empty ? "py-0.5" : "mt-2",
      )}
      role="status"
      aria-label="Svarar"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="animate-stream-dot size-1.5 rounded-full bg-muted-foreground/65"
          style={{ animationDelay: `${i * 140}ms` }}
        />
      ))}
    </span>
  )
}

function useAssistantLumoDocument(message: UIMessage): {
  doc: LumoDocument | null
  streaming: boolean
  chapters: Array<ChapterItem>
} {
  const streaming = message.status === "streaming"
  const rawText = messageText(message)
  // Smooth character reveal walks through broken mid-JSON (trailing commas,
  // half keys) and makes the UI flash empty placeholders. Only smooth plain text.
  const looksLikeJson = rawText.trimStart().startsWith("{")
  const [smoothText] = useSmoothText(rawText, {
    startStreaming: streaming && !looksLikeJson,
  })
  const text = streaming && !looksLikeJson ? smoothText : rawText

  const parsed = useMemo(
    () => (text ? parseLumoDocument(text, { streaming }) : null),
    [text, streaming],
  )

  const lastGoodRef = useRef<LumoDocument | null>(null)
  const lastKeyRef = useRef(message.key)
  if (lastKeyRef.current !== message.key) {
    lastKeyRef.current = message.key
    lastGoodRef.current = null
  }

  const parsedVisible = parsed !== null && documentHasVisibleParts(parsed)
  if (parsedVisible) {
    lastGoodRef.current = parsed
  }

  const doc =
    parsedVisible
      ? parsed
      : streaming && lastGoodRef.current !== null
        ? lastGoodRef.current
        : parsed

  const visibleDoc =
    doc !== null && documentHasVisibleParts(doc) ? doc : null

  return {
    doc: visibleDoc,
    streaming,
    chapters: chaptersFromDocument(visibleDoc),
  }
}

function AssistantMessageRow({
  message,
  onQuickReply,
  quickRepliesDisabled,
  listRef,
}: {
  message: UIMessage
  onQuickReply?: (label: string) => void
  quickRepliesDisabled?: boolean
  listRef?: (node: HTMLLIElement | null) => void
}) {
  const { doc, streaming, chapters } = useAssistantLumoDocument(message)
  const [activePartIndex, setActivePartIndex] = useState<number | null>(null)

  function jumpToChapter(partIndex: number) {
    setActivePartIndex(partIndex)
    const el = document.getElementById(
      subproblemAnchorId(message.key, partIndex),
    )
    el?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <li ref={listRef} className="flex items-start gap-2">
      <ChapterSelector
        chapters={chapters}
        loading={streaming}
        activePartIndex={activePartIndex}
        onSelect={jumpToChapter}
      />
      <div className="min-w-0 max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
        {doc ? (
          <div>
            <LumoParts
              document={doc}
              messageKey={message.key}
              onQuickReply={onQuickReply}
              quickRepliesDisabled={quickRepliesDisabled || streaming}
            />
            {streaming ? <StreamingIndicator /> : null}
          </div>
        ) : streaming ? (
          <StreamingIndicator empty />
        ) : (
          <span className="text-muted-foreground italic">…</span>
        )}
      </div>
    </li>
  )
}

function UserMessageContent({ message }: { message: UIMessage }) {
  const text = messageText(message)

  const images = message.parts.filter(
    (
      part,
    ): part is {
      type: "file"
      url: string
      mediaType: string
      filename?: string
    } => part.type === "file" && part.mediaType.startsWith("image/"),
  )

  return (
    <div className="flex flex-col gap-2">
      {text ? <UserMessageText text={text} /> : null}
      {images.map((part, index) => (
        <img
          key={`${message.key}-img-${index}`}
          src={part.url}
          alt={part.filename ?? "Bifogad bild"}
          className="max-h-64 max-w-full rounded-md object-contain"
        />
      ))}
      {!text && images.length === 0 ? (
        <span className="text-muted-foreground italic">…</span>
      ) : null}
    </div>
  )
}

function ThreadTitleEditor({
  roomId,
  threadId,
  title,
}: {
  roomId: Id<"rooms">
  threadId: string
  title: string
}) {
  const setTitle = useMutation(api.threads.setTitle)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) {
      setDraft(title)
      setError(null)
    }
  }, [editing, title])

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  function startEdit() {
    setDraft(title)
    setError(null)
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setDraft(title)
    setError(null)
  }

  async function commitEdit() {
    const next = draft.trim().slice(0, MAX_TITLE_LENGTH)
    if (next.length === 0) {
      setError("Titeln får inte vara tom")
      inputRef.current?.focus()
      return
    }
    if (next === title) {
      setEditing(false)
      setError(null)
      return
    }

    setSaving(true)
    setError(null)
    try {
      await setTitle({ roomId, threadId, title: next })
      setEditing(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Kunde inte byta titel")
      inputRef.current?.focus()
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          className="min-w-0 truncate text-left text-lg font-medium hover:underline"
          title={`${title} — klicka för att byta titel`}
          onClick={startEdit}
        >
          {title}
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="size-7 shrink-0 px-0"
          title="Byt titel"
          onClick={startEdit}
        >
          <Pencil className="size-3.5" />
          <span className="sr-only">Byt titel</span>
        </Button>
      </div>
    )
  }

  return (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Input
          ref={inputRef}
          value={draft}
          maxLength={MAX_TITLE_LENGTH}
          disabled={saving}
          aria-label="Chattitel"
          aria-invalid={error !== null}
          className="h-9 min-w-0 flex-1 text-lg font-medium"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              void commitEdit()
            } else if (event.key === "Escape") {
              event.preventDefault()
              cancelEdit()
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          disabled={saving || draft.trim().length === 0}
          onClick={() => {
            void commitEdit()
          }}
        >
          {saving ? "Sparar…" : "Spara"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={saving}
          onClick={cancelEdit}
        >
          Avbryt
        </Button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Enter sparar · Esc avbryter
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {draft.length}/{MAX_TITLE_LENGTH}
        </p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}

export function ThreadChat({
  roomId,
  threadId,
  title,
  mode = DEFAULT_CHAT_MODE,
  deletionExpiry = DEFAULT_CHAT_DELETION_EXPIRY,
  deleteAt = null,
  mentionedProblemNumbers = [],
  onArchived,
  composerFocusSignal,
}: ThreadChatProps) {
  const { results, status } = useUIMessages(
    api.threads.listMessages,
    { roomId, threadId },
    { initialNumItems: 50, stream: true },
  )
  const problemGroups = useQuery(api.PDFParse.problems.listGroupedByRoom, {
    roomId,
  })
  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const setMode = useMutation(api.threads.setMode)
  const setDeletionExpiry = useMutation(api.threads.setDeletionExpiry)
  const archiveThread = useMutation(api.threads.archive)
  const sendMessage = useMutation(api.threads.sendMessage).withOptimisticUpdate(
    (store, args) => {
      optimisticallySendMessage(api.threads.listMessages)(store, {
        threadId: args.threadId,
        prompt: args.prompt.trim() || "Bild",
      })
    },
  )

  const [pending, setPending] = useState(false)
  const [modePending, setModePending] = useState(false)
  const [expiryPending, setExpiryPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const messageNodeRefs = useRef(new Map<string, HTMLLIElement>())
  const scrolledToReplyKeyRef = useRef<string | null>(null)
  const scrolledToUserKeyRef = useRef<string | null>(null)
  const seededScrollRef = useRef(false)

  const messages = results

  const problemOptions = useMemo(() => {
    if (!problemGroups) return []
    return problemGroups.flatMap((group) =>
      group.problems.flatMap((problem) => [
        {
          id: problem.id,
          problemNumber: problem.problemNumber,
          fileName: group.fileName,
        },
        ...problem.shadows.map((shadow) => ({
          id: shadow.id,
          problemNumber: shadow.problemNumber,
          fileName: group.fileName,
        })),
      ]),
    )
  }, [problemGroups])

  const threadMentions = useMemo(
    () =>
      collectThreadMentions(messages, problemOptions, mentionedProblemNumbers),
    [mentionedProblemNumbers, messages, problemOptions],
  )

  const lastUserMessageKey = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === "user") return messages[i]!.key
    }
    return null
  }, [messages])

  // Stable identity for the in-flight assistant reply — not its growing text.
  const streamingReplyKey = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]
      if (message?.role === "assistant" && message.status === "streaming") {
        return message.key
      }
    }
    return null
  }, [messages])

  function scrollMessageIntoView(key: string, behavior: ScrollBehavior) {
    const container = scrollRef.current
    const node = messageNodeRefs.current.get(key)
    if (!container || !node) return false

    const containerRect = container.getBoundingClientRect()
    const nodeRect = node.getBoundingClientRect()
    const top = container.scrollTop + (nodeRect.top - containerRect.top) - 12
    container.scrollTo({ top: Math.max(0, top), behavior })
    return true
  }

  // Reset scroll bookkeeping when switching threads.
  useEffect(() => {
    seededScrollRef.current = false
    scrolledToUserKeyRef.current = null
    scrolledToReplyKeyRef.current = null
    messageNodeRefs.current.clear()
  }, [threadId])

  // Treat the first loaded history as already seen so opening a thread
  // doesn’t jump. Still allow a one-time scroll to a live streaming reply.
  useEffect(() => {
    if (seededScrollRef.current || status === "LoadingFirstPage") return
    seededScrollRef.current = true
    scrolledToUserKeyRef.current = lastUserMessageKey
  }, [status, lastUserMessageKey, threadId])

  // Scroll once to the user’s send, then once to the start of the reply.
  // Do not re-scroll as tokens arrive — that would yank the reader away.
  useEffect(() => {
    if (!seededScrollRef.current) return
    if (
      !lastUserMessageKey ||
      scrolledToUserKeyRef.current === lastUserMessageKey
    ) {
      return
    }

    let cancelled = false
    let attempts = 0
    const tryScroll = () => {
      if (cancelled) return
      if (scrollMessageIntoView(lastUserMessageKey, "smooth")) {
        scrolledToUserKeyRef.current = lastUserMessageKey
        return
      }
      if (attempts++ < 12) window.requestAnimationFrame(tryScroll)
    }
    tryScroll()
    return () => {
      cancelled = true
    }
  }, [lastUserMessageKey, pending])

  useEffect(() => {
    if (!seededScrollRef.current) return
    if (
      !streamingReplyKey ||
      scrolledToReplyKeyRef.current === streamingReplyKey
    ) {
      return
    }

    let cancelled = false
    let attempts = 0
    const tryScroll = () => {
      if (cancelled) return
      if (scrollMessageIntoView(streamingReplyKey, "smooth")) {
        scrolledToReplyKeyRef.current = streamingReplyKey
        return
      }
      if (attempts++ < 12) window.requestAnimationFrame(tryScroll)
    }
    tryScroll()
    return () => {
      cancelled = true
    }
  }, [streamingReplyKey])

  async function uploadImage(file: File) {
    const storageId = await uploadFileToStorage(file, () =>
      generateUploadUrl({ roomId }),
    )
    return { storageId, filename: file.name }
  }

  async function sendPrompt(
    text: string,
    images: ChatInputSubmitPayload["images"] = [],
    problemIds?: ChatInputSubmitPayload["problemIds"],
    storageImages?: ChatInputSubmitPayload["storageImages"],
  ) {
    const trimmed = text.trim()
    const readyStorage = storageImages ?? []
    if ((!trimmed && images.length === 0 && readyStorage.length === 0) || pending)
      return

    setError(null)
    setPending(true)

    try {
      const uploaded = await Promise.all(
        images.map((image) => uploadImage(image.file)),
      )
      const allImages = [...readyStorage, ...uploaded]
      await sendMessage({
        roomId,
        threadId,
        prompt: trimmed,
        images: allImages.length > 0 ? allImages : undefined,
        problemIds,
        problemId: problemIds?.[0],
        debugSolve: import.meta.env.DEV,
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Kunde inte skicka")
      throw err
    } finally {
      setPending(false)
    }
  }

  async function handleModeChange(next: ChatMode) {
    if (next === mode || modePending) return
    setModePending(true)
    setError(null)
    try {
      await setMode({ roomId, threadId, mode: next })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Kunde inte byta läge")
    } finally {
      setModePending(false)
    }
  }

  async function handleDeletionExpiryChange(next: ChatDeletionExpiry) {
    if (next === deletionExpiry || expiryPending) return
    setExpiryPending(true)
    setError(null)
    try {
      await setDeletionExpiry({ roomId, threadId, deletionExpiry: next })
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Kunde inte byta arkiveringstid",
      )
    } finally {
      setExpiryPending(false)
    }
  }

  async function handleArchiveNow() {
    setError(null)
    try {
      await archiveThread({ roomId, threadId })
      onArchived?.()
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Kunde inte arkivera chatten",
      )
      throw err
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b border-border pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <ThreadTitleEditor
              roomId={roomId}
              threadId={threadId}
              title={title}
            />
            {import.meta.env.DEV ? (
              <CopyRawJsonButton messages={messages} />
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ChatModePicker
              value={mode}
              onChange={(next) => {
                void handleModeChange(next)
              }}
              disabled={modePending || pending}
            />
            <ChatDeletionExpiryPicker
              value={deletionExpiry}
              deleteAt={deleteAt}
              onChange={(next) => {
                void handleDeletionExpiryChange(next)
              }}
              onArchiveNow={handleArchiveNow}
              disabled={expiryPending || pending}
            />
          </div>
        </div>
        {threadMentions.length > 0 ? (
          <MentionedProblems
            roomId={roomId}
            mentions={threadMentions}
            align="start"
            className="max-h-64 overflow-y-auto"
          />
        ) : null}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto py-4 pr-3">
        {status === "LoadingFirstPage" ? (
          <p className="text-sm text-muted-foreground">Hämtar meddelanden…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Skriv ett meddelande eller bifoga en bild för att börja.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((message) =>
              message.role === "user" ? (
                <li
                  key={message.key}
                  ref={(node) => {
                    if (node) messageNodeRefs.current.set(message.key, node)
                    else messageNodeRefs.current.delete(message.key)
                  }}
                  className="flex flex-col items-end gap-2"
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                      "bg-primary text-primary-foreground",
                    )}
                  >
                    <UserMessageContent message={message} />
                  </div>
                </li>
              ) : (
                <AssistantMessageRow
                  key={message.key}
                  message={message}
                  listRef={(node) => {
                    if (node) messageNodeRefs.current.set(message.key, node)
                    else messageNodeRefs.current.delete(message.key)
                  }}
                  onQuickReply={(label) => {
                    void sendPrompt(label).catch(() => undefined)
                  }}
                  quickRepliesDisabled={pending}
                />
              ),
            )}
          </ul>
        )}
      </div>

      <ChatInput
        roomId={roomId}
        pending={pending}
        error={error}
        mode={mode}
        onModeChange={handleModeChange}
        focusSignal={composerFocusSignal}
        onSubmit={async ({ prompt, images, problemIds, storageImages }) => {
          await sendPrompt(prompt, images, problemIds, storageImages)
        }}
      />
    </div>
  )
}
