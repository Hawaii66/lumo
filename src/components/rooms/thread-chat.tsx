import {
  optimisticallySendMessage,
  useSmoothText,
  useUIMessages,
} from "@convex-dev/agent/react"
import { useMutation, useQuery } from "convex/react"
import { Pencil } from "lucide-react"
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
import { parseLumoDocument } from "~/lib/lumo-content"
import { uploadFileToStorage } from "~/lib/upload"
import { cn } from "~/lib/utils"

const MAX_TITLE_LENGTH = 80

type ThreadChatProps = {
  roomId: Id<"rooms">
  threadId: string
  title: string
  mode?: ChatMode
  deletionExpiry?: ChatDeletionExpiry
  deleteAt?: number | null
  mentionedProblemNumbers?: string[]
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

function AssistantMessageContent({
  message,
  onQuickReply,
  quickRepliesDisabled,
}: {
  message: UIMessage
  onQuickReply?: (label: string) => void
  quickRepliesDisabled?: boolean
}) {
  const streaming = message.status === "streaming"
  const rawText = messageText(message)
  const [smoothText] = useSmoothText(rawText, {
    startStreaming: streaming,
  })
  const text = streaming ? smoothText : rawText

  if (!text) {
    return <span className="text-muted-foreground italic">…</span>
  }

  const doc = parseLumoDocument(text, { streaming })
  const hasVisibleParts = doc.parts.some(
    (part) =>
      (part.type === "text" && part.content.trim().length > 0) ||
      part.type !== "text",
  )

  if (!hasVisibleParts) {
    return <span className="text-muted-foreground italic">…</span>
  }

  return (
    <LumoParts
      document={doc}
      onQuickReply={onQuickReply}
      quickRepliesDisabled={quickRepliesDisabled || streaming}
    />
  )
}

function MessageContent({
  message,
  onQuickReply,
  quickRepliesDisabled,
}: {
  message: UIMessage
  onQuickReply?: (label: string) => void
  quickRepliesDisabled?: boolean
}) {
  if (message.role === "assistant") {
    return (
      <AssistantMessageContent
        message={message}
        onQuickReply={onQuickReply}
        quickRepliesDisabled={quickRepliesDisabled}
      />
    )
  }

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

  const messages = results

  const problemOptions = useMemo(() => {
    if (!problemGroups) return []
    return problemGroups.flatMap((group) =>
      group.problems.map((problem) => ({
        id: problem.id,
        problemNumber: problem.problemNumber,
        fileName: group.fileName,
      })),
    )
  }, [problemGroups])

  const threadMentions = useMemo(
    () =>
      collectThreadMentions(messages, problemOptions, mentionedProblemNumbers),
    [mentionedProblemNumbers, messages, problemOptions],
  )

  // Key + status + text length so user sends and AI replies both re-scroll
  // (length alone misses content updates / status changes).
  const scrollSignature = useMemo(
    () =>
      messages
        .map(
          (message) =>
            `${message.key}:${message.status}:${messageText(message).length}`,
        )
        .join("|"),
    [messages],
  )

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [scrollSignature, pending])

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
        err instanceof Error ? err.message : "Kunde inte byta raderingstid",
      )
    } finally {
      setExpiryPending(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b border-border pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <ThreadTitleEditor
            roomId={roomId}
            threadId={threadId}
            title={title}
          />
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
                <li key={message.key} className="flex flex-col items-end gap-2">
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                      "bg-primary text-primary-foreground",
                    )}
                  >
                    <MessageContent message={message} />
                  </div>
                </li>
              ) : (
                <li
                  key={message.key}
                  className="max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm text-foreground"
                >
                  <MessageContent
                    message={message}
                    onQuickReply={(label) => {
                      void sendPrompt(label).catch(() => undefined)
                    }}
                    quickRepliesDisabled={pending}
                  />
                </li>
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
        onSubmit={async ({ prompt, images, problemIds, storageImages }) => {
          await sendPrompt(prompt, images, problemIds, storageImages)
        }}
      />
    </div>
  )
}
