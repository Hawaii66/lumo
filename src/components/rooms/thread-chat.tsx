import { optimisticallySendMessage, useUIMessages } from "@convex-dev/agent/react"
import { useMutation } from "convex/react"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "~/components/ui/button"
import { Textarea } from "~/components/ui/textarea"
import { cn } from "~/lib/utils"

type ThreadChatProps = {
  roomId: Id<"rooms">
  threadId: string
  title: string
}

export function ThreadChat({ roomId, threadId, title }: ThreadChatProps) {
  const { results, status } = useUIMessages(
    api.threads.listMessages,
    { roomId, threadId },
    { initialNumItems: 50 },
  )
  const sendMessage = useMutation(api.threads.sendMessage).withOptimisticUpdate(
    (store, args) => {
      optimisticallySendMessage(api.threads.listMessages)(store, {
        threadId: args.threadId,
        prompt: args.prompt,
      })
    },
  )

  const [prompt, setPrompt] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const messages = [...results].reverse()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = prompt.trim()
    if (!trimmed || pending) return

    setError(null)
    setPending(true)
    setPrompt("")
    void sendMessage({ roomId, threadId, prompt: trimmed })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Kunde inte skicka")
        setPrompt(trimmed)
      })
      .finally(() => setPending(false))
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
            Skriv ett meddelande för att börja.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((message) => (
              <li
                key={message.key}
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                  message.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                {message.text || (
                  <span className="text-muted-foreground italic">…</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-2 border-t border-border pt-4"
      >
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Skriv ett meddelande…"
          rows={2}
          disabled={pending}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              e.currentTarget.form?.requestSubmit()
            }
          }}
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={pending || !prompt.trim()}>
            {pending ? "Skickar…" : "Skicka"}
          </Button>
        </div>
      </form>
    </div>
  )
}
