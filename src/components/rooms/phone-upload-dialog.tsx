import { useMutation, useQuery } from "convex/react"
import { Smartphone } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import QRCode from "react-qr-code"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog"

export type PhoneUploadCompletedFile = {
  fileId: Id<"files">
  storageId: Id<"_storage">
  filename: string
}

type PhoneUploadDialogProps = {
  roomId: Id<"rooms">
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onCompleted?: (file: PhoneUploadCompletedFile) => void
  showTrigger?: boolean
  triggerLabel?: string
}

export function PhoneUploadDialog({
  roomId,
  open: controlledOpen,
  onOpenChange,
  onCompleted,
  showTrigger = true,
  triggerLabel = "Från telefon",
}: PhoneUploadDialogProps) {
  const createSession = useMutation(api.scanSessions.create)
  const cancelSession = useMutation(api.scanSessions.cancel)
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [sessionId, setSessionId] = useState<Id<"scanSessions"> | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [pageUrl, setPageUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const completedForSessionRef = useRef<Id<"scanSessions"> | null>(null)
  const startingRef = useRef(false)
  const onCompletedRef = useRef(onCompleted)
  onCompletedRef.current = onCompleted
  const onOpenChangeRef = useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange

  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolledOpen

  const status = useQuery(
    api.scanSessions.getStatus,
    sessionId !== null ? { sessionId } : "skip",
  )

  useEffect(() => {
    if (status?.status !== "completed") return
    if (sessionId === null) return
    if (completedForSessionRef.current === sessionId) return

    completedForSessionRef.current = sessionId

    if (
      status.fileId !== null &&
      status.storageId !== null &&
      status.fileName !== null
    ) {
      onCompletedRef.current?.({
        fileId: status.fileId,
        storageId: status.storageId,
        filename: status.fileName,
      })
    }

    if (!isControlled) {
      setUncontrolledOpen(false)
    }
    onOpenChangeRef.current?.(false)
    setSessionId(null)
    setToken(null)
    setPageUrl(null)
    setError(null)
  }, [status, sessionId, isControlled])

  useEffect(() => {
    if (token === null) {
      setPageUrl(null)
      return
    }
    setPageUrl(`${window.location.origin}/scan/${token}`)
  }, [token])

  function setOpen(next: boolean) {
    if (!isControlled) {
      setUncontrolledOpen(next)
    }
    onOpenChangeRef.current?.(next)
  }

  async function startSession() {
    if (startingRef.current) return
    startingRef.current = true
    setError(null)
    setStarting(true)
    completedForSessionRef.current = null
    try {
      const session = await createSession({ roomId })
      setSessionId(session.sessionId)
      setToken(session.token)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Kunde inte skapa QR-kod")
      setOpen(false)
    } finally {
      startingRef.current = false
      setStarting(false)
    }
  }

  useEffect(() => {
    if (!open || sessionId !== null || startingRef.current) return
    void startSession()
    // Start a session whenever the dialog opens without one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionId])

  async function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setOpen(true)
      return
    }

    const activeSessionId = sessionId
    setOpen(false)
    setSessionId(null)
    setToken(null)
    setPageUrl(null)
    setError(null)

    if (activeSessionId !== null && status?.status === "pending") {
      try {
        await cancelSession({ sessionId: activeSessionId })
      } catch {
        // Session may already be completed or expired.
      }
    }
  }

  const expired =
    status !== undefined &&
    status !== null &&
    (status.status === "expired" ||
      (status.status === "pending" && status.expiresAt <= Date.now()))

  return (
    <Dialog open={open} onOpenChange={(next) => void handleOpenChange(next)}>
      {showTrigger ? (
        <DialogTrigger
          render={<Button variant="outline" disabled={starting} />}
        >
          <Smartphone />
          {triggerLabel}
        </DialogTrigger>
      ) : null}
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Skanna med telefonen</DialogTitle>
          <DialogDescription>
            Öppna kameran på telefonen, skanna koden och ladda upp ett foto.
            Ingen inloggning behövs på telefonen.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-2">
          {starting || (token !== null && pageUrl === null) ? (
            <p className="text-sm text-muted-foreground">Skapar QR-kod…</p>
          ) : expired ? (
            <p className="text-sm text-destructive">
              Sessionen har gått ut. Stäng och öppna igen för en ny kod.
            </p>
          ) : pageUrl ? (
            <div className="rounded-lg bg-white p-3">
              <QRCode
                value={pageUrl}
                size={240}
                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                viewBox="0 0 240 240"
                title="QR-kod för telefonuppladdning"
              />
            </div>
          ) : null}

          {import.meta.env.DEV && pageUrl && !expired ? (
            <p className="text-center text-xs text-muted-foreground">
              {pageUrl}
            </p>
          ) : null}

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : status?.status === "pending" && !expired ? (
            <p className="text-sm text-muted-foreground">
              Väntar på uppladdning från telefonen…
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
