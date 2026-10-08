import {
  optimisticallySendMessage,
  useUIMessages,
} from "@convex-dev/agent/react"
import { useMutation } from "convex/react"
import { ImagePlus, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { api } from "../../../convex/_generated/api"
import type { FormEvent } from "react"
import type { UIMessage } from "@convex-dev/agent/react"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "~/components/ui/button"
import { Textarea } from "~/components/ui/textarea"
import { cn } from "~/lib/utils"

type ThreadChatProps = {
  roomId: Id<"rooms">
  threadId: string
  title: string
}

type PendingImage = {
  id: string
  file: File
  previewUrl: string
}

const MAX_IMAGES = 4
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

function MessageContent({ message }: { message: UIMessage }) {
  if (message.parts.length === 0) {
    return message.text ? (
      message.text
    ) : (
      <span className="text-muted-foreground italic">…</span>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {message.parts.map((part, index) => {
        const key = `${message.key}-${index}`
        if (part.type === "text") {
          return (
            <span key={key} className="whitespace-pre-wrap">
              {part.text}
            </span>
          )
        }
        if (
          part.type === "file" &&
          part.mediaType.startsWith("image/")
        ) {
          return (
            <img
              key={key}
              src={part.url}
              alt={part.filename ?? "Bifogad bild"}
              className="max-h-64 max-w-full rounded-md object-contain"
            />
          )
        }
        return null
      })}
    </div>
  )
}

export function ThreadChat({ roomId, threadId, title }: ThreadChatProps) {
  const { results, status } = useUIMessages(
    api.threads.listMessages,
    { roomId, threadId },
    { initialNumItems: 50 },
  )
  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const sendMessage = useMutation(api.threads.sendMessage).withOptimisticUpdate(
    (store, args) => {
      optimisticallySendMessage(api.threads.listMessages)(store, {
        threadId: args.threadId,
        prompt: args.prompt.trim() || "Bild",
      })
    },
  )

  const [prompt, setPrompt] = useState("")
  const [pendingImages, setPendingImages] = useState<Array<PendingImage>>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingImagesRef = useRef(pendingImages)
  pendingImagesRef.current = pendingImages

  const messages = [...results].reverse()
  const canSend =
    (prompt.trim().length > 0 || pendingImages.length > 0) && !pending

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  useEffect(() => {
    return () => {
      for (const image of pendingImagesRef.current) {
        URL.revokeObjectURL(image.previewUrl)
      }
    }
  }, [])

  function addImages(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return

    setError(null)
    const next: Array<PendingImage> = []
    for (const file of Array.from(fileList)) {
      if (!file.type.startsWith("image/")) {
        setError("Endast bilder kan skickas just nu")
        continue
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setError("Bilden är för stor (max 10 MB)")
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
        setError(`Du kan bifoga högst ${MAX_IMAGES} bilder`)
        return current
      }
      if (next.length > remaining) {
        for (const image of next.slice(remaining)) {
          URL.revokeObjectURL(image.previewUrl)
        }
        setError(`Du kan bifoga högst ${MAX_IMAGES} bilder`)
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

  async function uploadImage(file: File) {
    const uploadUrl = await generateUploadUrl({ roomId })
    const result = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    })
    if (!result.ok) {
      throw new Error(`Kunde inte ladda upp ${file.name}`)
    }
    const { storageId } = (await result.json()) as {
      storageId: Id<"_storage">
    }
    return { storageId, filename: file.name }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = prompt.trim()
    if ((!trimmed && pendingImages.length === 0) || pending) return

    const imagesToSend = pendingImages
    setError(null)
    setPending(true)
    setPrompt("")
    setPendingImages([])

    try {
      const images = await Promise.all(
        imagesToSend.map((image) => uploadImage(image.file)),
      )
      await sendMessage({
        roomId,
        threadId,
        prompt: trimmed,
        images: images.length > 0 ? images : undefined,
      })
      for (const image of imagesToSend) {
        URL.revokeObjectURL(image.previewUrl)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Kunde inte skicka")
      setPrompt(trimmed)
      setPendingImages(imagesToSend)
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
            {messages.map((message) => (
              <li
                key={message.key}
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                  message.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                <MessageContent message={message} />
              </li>
            ))}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(event) => {
          void handleSubmit(event)
        }}
        className="flex flex-col gap-2 border-t border-border pt-4"
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
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

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
        <div className="flex items-center justify-between gap-2">
          <div>
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
          </div>
          <Button type="submit" disabled={!canSend}>
            {pending ? "Skickar…" : "Skicka"}
          </Button>
        </div>
      </form>
    </div>
  )
}
