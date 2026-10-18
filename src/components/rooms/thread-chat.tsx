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
import { MentionedProblems } from "~/components/rooms/mentioned-problems"
import { UserMessageText } from "~/components/rooms/user-message-text"
import { LumoParts } from "~/components/lumo/lumo-parts"
import { parseLumoDocument } from "~/lib/lumo-content"
import { uploadFileToStorage } from "~/lib/upload"
import { cn } from "~/lib/utils"

type ThreadChatProps = {
  roomId: Id<"rooms">
  threadId: string
  title: string
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

export function ThreadChat({ roomId, threadId, title }: ThreadChatProps) {
  const { results, status } = useUIMessages(
    api.threads.listMessages,
    { roomId, threadId },
    { initialNumItems: 50 },
  )
  const problemGroups = useQuery(api.PDFParse.problems.listGroupedByRoom, {
    roomId,
  })
  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const sendMessage = useMutation(api.threads.sendMessage).withOptimisticUpdate(
    (store, args) => {
      optimisticallySendMessage(api.threads.listMessages)(store, {
        threadId: args.threadId,
        prompt: args.prompt.trim() || "Bild",
      })
    },
  )

  const [pending, setPending] = useState(false)
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
    helpLevel?: ChatInputSubmitPayload["helpLevel"],
    problemIds?: ChatInputSubmitPayload["problemIds"],
  ) {
    const trimmed = text.trim()
    if ((!trimmed && images.length === 0) || pending) return

    setError(null)
    setPending(true)

    try {
      const uploaded = await Promise.all(
        images.map((image) => uploadImage(image.file)),
      )
      await sendMessage({
        roomId,
        threadId,
        prompt: trimmed,
        images: uploaded.length > 0 ? uploaded : undefined,
        helpLevel,
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border pb-4">
        <h2 className="text-lg font-medium">{title}</h2>
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
        onSubmit={async ({ prompt, images, helpLevel, problemIds }) => {
          await sendPrompt(prompt, images, helpLevel, problemIds)
        }}
      />
    </div>
  )
}
