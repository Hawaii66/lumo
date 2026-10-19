import {
  optimisticallySendMessage,
  useUIMessages,
} from "@convex-dev/agent/react"
import { useMutation, useQuery } from "convex/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { api } from "../../../convex/_generated/api"
import type { UIMessage } from "@convex-dev/agent/react"
import type { Id } from "../../../convex/_generated/dataModel"
import {
  ChatInput,
  type ChatInputSubmitPayload,
} from "~/components/rooms/chat-input"
import { ChatModePicker } from "~/components/rooms/chat-mode-picker"
import { MentionedProblems } from "~/components/rooms/mentioned-problems"
import { UserMessageText } from "~/components/rooms/user-message-text"
import { LumoParts } from "~/components/lumo/lumo-parts"
import {
  DEFAULT_CHAT_MODE,
  type ChatMode,
} from "~/lib/chat-mode"
import { parseLumoDocument } from "~/lib/lumo-content"
import { uploadFileToStorage } from "~/lib/upload"
import { cn } from "~/lib/utils"

type ThreadChatProps = {
  roomId: Id<"rooms">
  threadId: string
  title: string
  mode?: ChatMode
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
    const text =
      message.text ||
      message.parts
        .filter(
          (part): part is { type: "text"; text: string } => part.type === "text",
        )
        .map((part) => part.text)
        .join("\n")

    if (!text) {
      return <span className="text-muted-foreground italic">…</span>
    }

    const doc = parseLumoDocument(text)
    return (
      <LumoParts
        document={doc}
        onQuickReply={onQuickReply}
        quickRepliesDisabled={quickRepliesDisabled}
      />
    )
  }

  const text =
    message.text ||
    message.parts
      .filter(
        (part): part is { type: "text"; text: string } => part.type === "text",
      )
      .map((part) => part.text)
      .join("\n")

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

function UserMessageGroup({
  message,
  roomId,
  problemOptions,
}: {
  message: UIMessage
  roomId: Id<"rooms">
  problemOptions: Array<{
    id: string
    problemNumber: string
    fileName: string
  }>
}) {
  const text =
    message.text ||
    message.parts
      .filter(
        (part): part is { type: "text"; text: string } => part.type === "text",
      )
      .map((part) => part.text)
      .join("\n")

  return (
    <li className="flex flex-col gap-2">
      {text ? (
        <MentionedProblems
          roomId={roomId}
          text={text}
          problemOptions={problemOptions}
        />
      ) : null}
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm",
          "ml-auto bg-primary text-primary-foreground",
        )}
      >
        <MessageContent message={message} />
      </div>
    </li>
  )
}

export function ThreadChat({
  roomId,
  threadId,
  title,
  mode = DEFAULT_CHAT_MODE,
}: ThreadChatProps) {
  const { results, status } = useUIMessages(
    api.threads.listMessages,
    { roomId, threadId },
    { initialNumItems: 50 },
  )
  const problemGroups = useQuery(api.PDFParse.problems.listGroupedByRoom, {
    roomId,
  })
  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const setMode = useMutation(api.threads.setMode)
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
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const messages = [...results].reverse()

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b border-border pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-lg font-medium">{title}</h2>
          <ChatModePicker
            value={mode}
            onChange={(next) => {
              void handleModeChange(next)
            }}
            disabled={modePending || pending}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Läget gäller hela chatten och kan bytas när som helst.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-4">
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
                <UserMessageGroup
                  key={message.key}
                  message={message}
                  roomId={roomId}
                  problemOptions={problemOptions}
                />
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
        <div ref={bottomRef} />
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
