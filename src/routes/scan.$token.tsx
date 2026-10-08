import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery } from "convex/react"
import { Camera, CheckCircle2, ImagePlus, Loader2 } from "lucide-react"
import { useRef, useState } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Button } from "~/components/ui/button"

export const Route = createFileRoute("/scan/$token")({
  component: PhoneScanPage,
})

function PhoneScanPage() {
  const { token } = Route.useParams()
  const session = useQuery(api.scanSessions.getByToken, { token })
  const generateUploadUrl = useMutation(api.scanSessions.generateUploadUrl)
  const completeUpload = useMutation(api.scanSessions.complete)

  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isExpired =
    session !== undefined &&
    session !== null &&
    (session.status === "expired" ||
      (session.status === "pending" && session.expiresAt <= Date.now()))

  async function uploadFile(file: File | undefined) {
    if (!file) return

    setError(null)
    setUploading(true)
    try {
      const uploadUrl = await generateUploadUrl({ token })
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      })
      if (!result.ok) {
        throw new Error("Kunde inte ladda upp bilden")
      }
      const { storageId } = (await result.json()) as {
        storageId: Id<"_storage">
      }
      await completeUpload({
        token,
        name: file.name || `foto-${Date.now()}.jpg`,
        storageId,
      })
      setDone(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Kunde inte ladda upp")
    } finally {
      setUploading(false)
      if (cameraInputRef.current) cameraInputRef.current.value = ""
      if (galleryInputRef.current) galleryInputRef.current.value = ""
    }
  }

  if (session === undefined) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background p-6 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Öppnar…
      </main>
    )
  }

  if (session === null) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-2 bg-background p-6 text-center">
        <h1 className="text-xl font-semibold">Ogiltig länk</h1>
        <p className="text-sm text-muted-foreground">
          QR-koden är ogiltig eller har redan använts.
        </p>
      </main>
    )
  }

  if (done || session.status === "completed") {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <CheckCircle2 className="size-12 text-primary" />
        <h1 className="text-xl font-semibold">Uppladdat</h1>
        <p className="text-sm text-muted-foreground">
          Bilden syns nu i rummet. Du kan stänga den här sidan.
        </p>
      </main>
    )
  }

  if (isExpired) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-2 bg-background p-6 text-center">
        <h1 className="text-xl font-semibold">Sessionen har gått ut</h1>
        <p className="text-sm text-muted-foreground">
          Skanna en ny QR-kod från datorn för att försöka igen.
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-6 bg-background p-6">
      <div className="space-y-2 pt-4">
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
          Lumo
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Ladda upp till {session.roomName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Ta ett foto eller välj en bild från telefonen. Ingen inloggning
          behövs.
        </p>
      </div>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={uploading}
        onChange={(event) => {
          void uploadFile(event.target.files?.[0])
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={uploading}
        onChange={(event) => {
          void uploadFile(event.target.files?.[0])
        }}
      />

      <div className="flex flex-col gap-3">
        <Button
          size="lg"
          className="h-14 w-full text-base"
          disabled={uploading}
          onClick={() => cameraInputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Camera />
          )}
          {uploading ? "Laddar upp…" : "Ta foto"}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-14 w-full text-base"
          disabled={uploading}
          onClick={() => galleryInputRef.current?.click()}
        >
          <ImagePlus />
          Välj från galleri
        </Button>
      </div>

      {error ? (
        <p className="text-center text-sm text-destructive">{error}</p>
      ) : null}
    </main>
  )
}
