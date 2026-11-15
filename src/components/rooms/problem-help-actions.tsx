import { Lightbulb, ScanSearch } from "lucide-react"
import { useRef, useState } from "react"
import type { Id } from "../../../convex/_generated/dataModel"
import {
  buildModeStartPrompt,
  buildScanStartPrompt,
  type ChatMode,
} from "~/lib/chat-mode"
import {
  PhoneUploadDialog,
  type PhoneUploadCompletedFile,
} from "~/components/rooms/phone-upload-dialog"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"

export type ProblemHelpStartDraft = {
  mode: ChatMode
  prompt: string
  images?: Array<{ storageId: Id<"_storage">; filename: string }>
  subproblemLetter?: string
}

type PendingKey =
  | "genomgang"
  | "scan"
  | `genomgang-${string}`
  | `scan-${string}`

type ProblemHelpActionsProps = {
  roomId: Id<"rooms">
  problemNumber: string
  fileName: string
  /** Deluppgift letters from the problem markdown, e.g. ["a","b"]. */
  subproblemLetters?: Array<string>
  onSelect: (draft: ProblemHelpStartDraft) => void | Promise<void>
  pending?: boolean
  className?: string
}

export function ProblemHelpActions({
  roomId,
  problemNumber,
  fileName,
  subproblemLetters = [],
  onSelect,
  pending = false,
  className,
}: ProblemHelpActionsProps) {
  const [qrOpen, setQrOpen] = useState(false)
  const [scanLetter, setScanLetter] = useState<string | null>(null)
  const [localPending, setLocalPending] = useState<PendingKey | null>(null)
  const scanLetterRef = useRef<string | null>(null)

  const letters = subproblemLetters
    .map((letter) => letter.trim().toLowerCase())
    .filter((letter) => /^[a-z]$/.test(letter))

  async function start(draft: ProblemHelpStartDraft, pendingKey: PendingKey) {
    if (pending || localPending !== null) return
    setLocalPending(pendingKey)
    try {
      await onSelect(draft)
    } finally {
      setLocalPending(null)
    }
  }

  const busy = pending || localPending !== null || qrOpen

  function startGenomgang(letter: string | null) {
    void start(
      {
        mode: "genomgang",
        prompt: buildModeStartPrompt(
          "genomgang",
          problemNumber,
          fileName,
          letter,
        ),
        subproblemLetter: letter ?? undefined,
      },
      letter !== null ? `genomgang-${letter}` : "genomgang",
    )
  }

  function openScan(letter: string | null) {
    if (busy) return
    scanLetterRef.current = letter
    setScanLetter(letter)
    setQrOpen(true)
  }

  function handlePhotoUploaded(file: PhoneUploadCompletedFile) {
    const letter = scanLetterRef.current
    scanLetterRef.current = null
    setScanLetter(null)
    void start(
      {
        mode: "normal",
        prompt: buildScanStartPrompt(problemNumber, fileName, letter),
        images: [{ storageId: file.storageId, filename: file.filename }],
        subproblemLetter: letter ?? undefined,
      },
      letter !== null ? `scan-${letter}` : "scan",
    )
  }

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div className="grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2 sm:items-stretch">
        {/* Left column: big Genomgång (+ subproblem row when present) */}
        <div
          className={cn(
            letters.length > 0 && "grid grid-rows-[1fr_auto] gap-2",
            letters.length === 0 && "flex h-full flex-col",
          )}
        >
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => startGenomgang(null)}
            className={cn(
              "flex h-auto min-h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-primary bg-background px-5 py-6 text-primary whitespace-normal",
              "hover:bg-primary/10 hover:text-primary",
              letters.length === 0 && "h-full",
            )}
          >
            <Lightbulb className="size-8 stroke-[1.75]" />
            <span className="text-lg font-semibold tracking-tight">
              {localPending === "genomgang" ? "Startar…" : "Genomgång"}
            </span>
            <span className="text-sm font-normal text-primary/80">
              Gå igenom uppgiften steg för steg
            </span>
          </Button>

          {letters.length > 0 ? (
            <div
              role="group"
              aria-label="Genomgång per deluppgift"
              className="grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${Math.min(letters.length, 4)}, minmax(0, 1fr))`,
              }}
            >
              {letters.map((letter) => {
                const pendingKey = `genomgang-${letter}` as const
                const letterPending = localPending === pendingKey
                return (
                  <Button
                    key={letter}
                    type="button"
                    variant="outline"
                    disabled={busy}
                    title={`Genomgång av deluppgift (${letter})`}
                    aria-label={`Genomgång av deluppgift ${letter}`}
                    onClick={() => {
                      if (busy) return
                      startGenomgang(letter)
                    }}
                    className={cn(
                      "h-auto min-h-10 rounded-xl border-2 border-primary bg-background px-2 py-2 text-sm font-semibold tabular-nums text-primary",
                      "hover:bg-primary/10 hover:text-primary",
                      letterPending && "bg-primary/10",
                    )}
                  >
                    {letterPending ? "…" : `(${letter})`}
                  </Button>
                )
              })}
            </div>
          ) : null}
        </div>

        {/* Right column: Scan (+ subproblem row when present) */}
        <div
          className={cn(
            letters.length > 0 && "grid grid-rows-[1fr_auto] gap-2",
            letters.length === 0 && "flex h-full flex-col",
          )}
        >
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => openScan(null)}
            className={cn(
              "flex h-auto min-h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-primary bg-background px-5 py-6 text-primary whitespace-normal",
              "hover:bg-primary/10 hover:text-primary",
              letters.length === 0 && "h-full",
              qrOpen && scanLetter === null && "bg-primary/10",
            )}
          >
            <ScanSearch className="size-8 stroke-[1.75]" />
            <span className="text-lg font-semibold tracking-tight">
              {localPending === "scan" ? "Startar…" : "Skanna mitt arbete"}
            </span>
            <span className="text-sm font-normal text-primary/80">
              Ladda upp från telefon
            </span>
          </Button>

          {letters.length > 0 ? (
            <div
              role="group"
              aria-label="Skanna per deluppgift"
              className="grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${Math.min(letters.length, 4)}, minmax(0, 1fr))`,
              }}
            >
              {letters.map((letter) => {
                const pendingKey = `scan-${letter}` as const
                const letterPending = localPending === pendingKey
                const letterWaiting = qrOpen && scanLetter === letter
                return (
                  <Button
                    key={letter}
                    type="button"
                    variant="outline"
                    disabled={busy}
                    title={`Skanna deluppgift (${letter})`}
                    aria-label={`Skanna deluppgift ${letter}`}
                    onClick={() => openScan(letter)}
                    className={cn(
                      "h-auto min-h-10 rounded-xl border-2 border-primary bg-background px-2 py-2 text-sm font-semibold tabular-nums text-primary",
                      "hover:bg-primary/10 hover:text-primary",
                      (letterPending || letterWaiting) && "bg-primary/10",
                    )}
                  >
                    {letterPending ? "…" : `(${letter})`}
                  </Button>
                )
              })}
            </div>
          ) : null}
        </div>
      </div>

      <PhoneUploadDialog
        roomId={roomId}
        open={qrOpen}
        onOpenChange={(open) => {
          setQrOpen(open)
          if (!open) {
            scanLetterRef.current = null
            setScanLetter(null)
          }
        }}
        onCompleted={handlePhotoUploaded}
        showTrigger={false}
      />
    </div>
  )
}
