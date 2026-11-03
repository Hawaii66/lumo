import {
  optimisticallySendMessage,
  useUIMessages,
} from "@convex-dev/agent/react"
import { useMutation } from "convex/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import {
  ChatInput,
  type ChatInputHandle,
  type ChatInputSubmitPayload,
  type RoomProblemGroup,
} from "~/components/rooms/chat-input"
import { SelectionCitePopup } from "~/components/rooms/selection-cite-popup"
import { ChatDeletionExpiryPicker } from "~/components/rooms/chat-deletion-expiry-picker"
import { ChatModePicker } from "~/components/rooms/chat-mode-picker"
import { MentionedProblems } from "~/components/rooms/mentioned-problems"
import {
  AssistantMessageRow,
  collectThreadMentions,
  CopyChatTextButton,
  UserMessageContent,
} from "~/components/rooms/thread-chat-messages"
import { ThreadTitleEditor } from "~/components/rooms/thread-title-editor"
import {
  DEFAULT_CHAT_DELETION_EXPIRY,
  type ChatDeletionExpiry,
} from "~/lib/chat-deletion-expiry"
import {
  assistantResponseNumber,
  formatReplyToAssistant,
} from "~/lib/chat-composer"
import {
  DEFAULT_CHAT_MODE,
  type ChatMode,
} from "~/lib/chat-mode"
import { uploadFileToStorage } from "~/lib/upload"
import { cn } from "~/lib/utils"

type ThreadChatProps = {
  roomId: Id<"rooms">
  threadId: string
  title: string
  /** Shared room problem tree from the parent page subscription. */
  problemGroups: Array<RoomProblemGroup> | undefined
  mode?: ChatMode
  deletionExpiry?: ChatDeletionExpiry
  deleteAt?: number | null
  mentionedProblemNumbers?: string[]
  onArchived?: () => void
  /** Increment to focus the composer (e.g. after starting a new chat). */
  composerFocusSignal?: number
}

export function ThreadChat({
  roomId,
  threadId,
  title,
  problemGroups,
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
  const chatInputRef = useRef<ChatInputHandle>(null)
  const messageNodeRefs = useRef(new Map<string, HTMLLIElement>())
  const scrolledToReplyKeyRef = useRef<string | null>(null)
  const scrolledToUserKeyRef = useRef<string | null>(null)
  const seededScrollRef = useRef(false)

  const messages = results

  const responseNumberByKey = useMemo(() => {
    const map = new Map<string, number>()
    let number = 0
    for (const message of messages) {
      if (message.role !== "assistant") continue
      number += 1
      map.set(message.key, number)
    }
    return map
  }, [messages])

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
              <CopyChatTextButton messages={messages} />
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

      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-y-auto py-4 pr-3"
      >
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
                  responseNumber={
                    responseNumberByKey.get(message.key) ??
                    assistantResponseNumber(messages, message.key) ??
                    1
                  }
                  listRef={(node) => {
                    if (node) messageNodeRefs.current.set(message.key, node)
                    else messageNodeRefs.current.delete(message.key)
                  }}
                  onQuickReply={(label) => {
                    const responseNumber =
                      responseNumberByKey.get(message.key) ??
                      assistantResponseNumber(messages, message.key) ??
                      1
                    void sendPrompt(
                      formatReplyToAssistant(responseNumber, label),
                    ).catch(() => undefined)
                  }}
                  onCiteMath={(latex) => {
                    const responseNumber =
                      responseNumberByKey.get(message.key) ??
                      assistantResponseNumber(messages, message.key) ??
                      1
                    chatInputRef.current?.insertCitation({
                      responseNumber,
                      latex,
                    })
                  }}
                  quickRepliesDisabled={pending}
                />
              ),
            )}
          </ul>
        )}
        <SelectionCitePopup
          containerRef={scrollRef}
          onCite={(citation) => {
            chatInputRef.current?.insertCitation(citation)
          }}
        />
      </div>

      <ChatInput
        ref={chatInputRef}
        roomId={roomId}
        problemGroups={problemGroups}
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
