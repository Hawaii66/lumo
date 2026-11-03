import { useSmoothText } from "@convex-dev/agent/react"
import { Check, Copy } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import type { UIMessage } from "@convex-dev/agent/react"
import {
  ChapterSelector,
  type ChapterItem,
} from "~/components/rooms/chapter-selector"
import { UserMessageText } from "~/components/rooms/user-message-text"
import { MarkdownWithMath } from "~/components/lumo/markdown-with-math"
import { QuickReplies } from "~/components/lumo/quick-replies"
import { Button } from "~/components/ui/button"
import {
  mentionTokenKey,
  resolveDraftMentions,
  type ProblemMentionOption,
  type ResolvedDraftMention,
} from "~/lib/chat-composer"
import {
  chatReplyHasVisibleContent,
  parseChatReply,
  type ChatReply,
} from "~/lib/chat-reply"
import {
  chaptersFromMarkdown,
  subproblemAnchorId,
} from "~/lib/markdown-math"
import { cn } from "~/lib/utils"

export function chaptersFromReply(reply: ChatReply | null): Array<ChapterItem> {
  if (!reply) return []
  return chaptersFromMarkdown(reply.markdown).map((chapter) => ({
    partIndex: chapter.index,
    label: chapter.label,
  }))
}

export function collectThreadMentions(
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
          : `token:${mentionTokenKey(mention).toLowerCase()}`
      if (!byKey.has(key)) byKey.set(key, mention)
    }
  }

  for (const message of messages) {
    if (message.role !== "user") continue
    const text = messageText(message)
    if (text) addFromText(text)
  }

  for (const token of mentionedProblemNumbers) {
    const already = [...byKey.values()].some(
      (mention) =>
        mentionTokenKey(mention).toLowerCase() === token.toLowerCase(),
    )
    if (!already) addFromText(`@${token}`)
  }

  return [...byKey.values()]
}

export function messageText(message: UIMessage): string {
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

export function formatAssistantText(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text) as unknown, null, 2)
  } catch {
    return text
  }
}

export function formatChatTranscript(messages: Array<UIMessage>): string | null {
  const blocks: Array<string> = []
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue
    const text = messageText(message).trim()
    if (text.length === 0) continue
    const label = message.role === "user" ? "User" : "Assistant"
    const body =
      message.role === "assistant" ? formatAssistantText(text) : text
    blocks.push(`${label}:\n${body}`)
  }
  if (blocks.length === 0) return null
  return blocks.join("\n\n")
}

export function CopyChatTextButton({ messages }: { messages: Array<UIMessage> }) {
  const [copied, setCopied] = useState(false)
  const transcript = useMemo(() => formatChatTranscript(messages), [messages])

  async function handleCopy() {
    if (!transcript) return
    try {
      await navigator.clipboard.writeText(transcript)
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
      title="Kopiera hela chatten"
      disabled={!transcript}
      onClick={() => {
        void handleCopy()
      }}
    >
      {copied ? (
        <Check className="size-3.5" />
      ) : (
        <Copy className="size-3.5" />
      )}
      <span className="sr-only">Kopiera hela chatten</span>
    </Button>
  )
}

export function StreamingIndicator({ empty }: { empty?: boolean }) {
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

export function useAssistantChatReply(message: UIMessage): {
  reply: ChatReply | null
  streaming: boolean
  chapters: Array<ChapterItem>
} {
  const streaming = message.status === "streaming"
  const rawText = messageText(message)
  // Smooth character reveal walks through broken mid-JSON and blanks the UI.
  // Only smooth plain text (non-JSON) streams.
  const looksLikeJson = rawText.trimStart().startsWith("{")
  const [smoothText] = useSmoothText(rawText, {
    startStreaming: streaming && !looksLikeJson,
  })
  const text = streaming && !looksLikeJson ? smoothText : rawText

  const parsed = useMemo(
    () => (text ? parseChatReply(text, { streaming }) : null),
    [text, streaming],
  )

  const lastGoodRef = useRef<ChatReply | null>(null)
  const lastKeyRef = useRef(message.key)
  if (lastKeyRef.current !== message.key) {
    lastKeyRef.current = message.key
    lastGoodRef.current = null
  }

  const parsedVisible =
    parsed !== null && chatReplyHasVisibleContent(parsed)
  if (parsedVisible) {
    lastGoodRef.current = parsed
  }

  const reply =
    parsedVisible
      ? parsed
      : streaming && lastGoodRef.current !== null
        ? lastGoodRef.current
        : parsed

  const visibleReply =
    reply !== null && chatReplyHasVisibleContent(reply) ? reply : null

  return {
    reply: visibleReply,
    streaming,
    chapters: chaptersFromReply(visibleReply),
  }
}

export function AssistantMessageRow({
  message,
  responseNumber,
  onQuickReply,
  onCiteMath,
  quickRepliesDisabled,
  listRef,
}: {
  message: UIMessage
  responseNumber: number
  onQuickReply?: (label: string) => void
  onCiteMath?: (latex: string) => void
  quickRepliesDisabled?: boolean
  listRef?: (node: HTMLLIElement | null) => void
}) {
  const { reply, streaming, chapters } = useAssistantChatReply(message)
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
      <div
        data-assistant-response={responseNumber}
        className="min-w-0 max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm text-foreground"
      >
        {reply ? (
          <div className="flex flex-col gap-3">
            <MarkdownWithMath
              markdown={reply.markdown}
              scopeKey={message.key}
              onCiteMath={onCiteMath}
            />
            {onQuickReply && !streaming ? (
              <QuickReplies
                choices={reply.quickReplies}
                onSelect={onQuickReply}
                disabled={quickRepliesDisabled}
              />
            ) : null}
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

export function UserMessageContent({ message }: { message: UIMessage }) {
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
