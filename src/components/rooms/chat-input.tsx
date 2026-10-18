import { ImagePlus, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import type { HelpLevel } from "~/lib/schemas"
import { Button } from "~/components/ui/button"
import { Textarea } from "~/components/ui/textarea"
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
}

type ChatInputProps = {
  onSubmit: (payload: ChatInputSubmitPayload) => Promise<void> | void
  pending?: boolean
  error?: string | null
  placeholder?: string
  className?: string
  showHelpLevels?: boolean
}

const MAX_IMAGES = 4
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

const HELP_LEVELS: Array<{ value: HelpLevel; label: string }> = [
  { value: "minimal", label: "Hitta fel" },
  { value: "explain", label: "Förklara" },
  { value: "solve", label: "Lös helt" },
]

export function ChatInput({
  onSubmit,
  pending = false,
  error = null,
  placeholder = "Skriv ett meddelande…",
  className,
  showHelpLevels = true,
}: ChatInputProps) {
  const helpLevel = useUiStore((s) => s.helpLevel)
  const setHelpLevel = useUiStore((s) => s.setHelpLevel)

  const [prompt, setPrompt] = useState("")
  const [pendingImages, setPendingImages] = useState<Array<ChatInputImage>>([])
  const [localError, setLocalError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingImagesRef = useRef(pendingImages)
  pendingImagesRef.current = pendingImages

  const displayError = localError ?? error
  const canSend =
    (prompt.trim().length > 0 || pendingImages.length > 0) && !pending

  useEffect(() => {
    return () => {
      for (const image of pendingImagesRef.current) {
        URL.revokeObjectURL(image.previewUrl)
      }
    }
  }, [])

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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = prompt.trim()
    if ((!trimmed && pendingImages.length === 0) || pending) return

    const imagesToSend = pendingImages
    setLocalError(null)
    setPrompt("")
    setPendingImages([])

    try {
      await onSubmit({
        prompt: trimmed,
        images: imagesToSend,
        helpLevel,
      })
      for (const image of imagesToSend) {
        URL.revokeObjectURL(image.previewUrl)
      }
    } catch {
      setPrompt(trimmed)
      setPendingImages(imagesToSend)
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event)
      }}
      className={cn("flex flex-col gap-2 border-t border-border pt-4", className)}
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

      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={placeholder}
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
  )
}
