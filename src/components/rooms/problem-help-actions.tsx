import { Footprints, Lightbulb, ScanSearch } from "lucide-react"
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

type PendingKey = "forsta_steget" | "genomgang" | "scan"

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
  const [localPending, setLocalPending] = useState<PendingKey | null>(null)
  /** null = whole problem (implicit); letter = scoped deluppgift. */
  const [scopeLetter, setScopeLetter] = useState<string | null>(null)
  const scopeLetterRef = useRef<string | null>(null)

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
  /** Primary accent when no deluppgifter, or when one is selected. */
  const scopeAccent = letters.length === 0 || scopeLetter !== null
  const modeButtonClass = cn(
    "flex h-auto min-h-20 w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 bg-background px-3 py-3 whitespace-normal",
    scopeAccent
      ? "border-primary text-primary hover:border-primary hover:bg-primary/10 hover:text-primary"
      : "border-border text-foreground hover:bg-muted",
  )
  const modeSubtitleClass = scopeAccent
    ? "text-xs font-normal text-primary/80"
    : "text-xs font-normal text-muted-foreground"

  function selectScope(letter: string) {
    const next = scopeLetter === letter ? null : letter
    setScopeLetter(next)
    scopeLetterRef.current = next
  }

  function startMode(mode: "forsta_steget" | "genomgang") {
    const letter = scopeLetter
    void start(
      {
        mode,
        prompt: buildModeStartPrompt(mode, problemNumber, fileName, letter),
        subproblemLetter: letter ?? undefined,
      },
      mode,
    )
  }

  function openScan() {
    if (busy) return
    scopeLetterRef.current = scopeLetter
    setQrOpen(true)
  }

  function handlePhotoUploaded(file: PhoneUploadCompletedFile) {
    const letter = scopeLetterRef.current
    void start(
      {
        mode: "normal",
        prompt: buildScanStartPrompt(problemNumber, fileName, letter),
        images: [{ storageId: file.storageId, filename: file.filename }],
        subproblemLetter: letter ?? undefined,
      },
      "scan",
    )
  }

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      {letters.length > 0 ? (
        <div
          role="group"
          aria-label="Deluppgifter"
          className="flex w-full max-w-3xl flex-wrap items-center justify-center gap-2"
        >
          {letters.map((letter) => {
            const selected = scopeLetter === letter
            return (
              <Button
                key={letter}
                type="button"
                variant="outline"
                disabled={busy}
                aria-pressed={selected}
                title={`Deluppgift (${letter})`}
                aria-label={`Deluppgift ${letter}`}
                onClick={() => selectScope(letter)}
                className={cn(
                  "h-auto min-h-12 min-w-12 rounded-xl border-2 px-5 py-2.5 text-base font-semibold tabular-nums",
                  selected
                    ? "border-primary bg-primary/10 text-primary hover:border-primary hover:bg-primary/10 hover:text-primary"
                    : "border-border bg-background text-foreground hover:bg-muted",
                )}
              >
                ({letter})
              </Button>
            )
          })}
        </div>
      ) : null}

      <div className="grid w-full max-w-3xl grid-cols-1 gap-2 sm:grid-cols-3 sm:items-stretch">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => startMode("forsta_steget")}
          className={modeButtonClass}
        >
          <Footprints className="size-6 stroke-[1.75]" />
          <span className="text-base font-semibold tracking-tight">
            {localPending === "forsta_steget" ? "Startar…" : "Första steget"}
          </span>
          <span className={modeSubtitleClass}>
            En liten puff — kom igång
          </span>
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => startMode("genomgang")}
          className={modeButtonClass}
        >
          <Lightbulb className="size-6 stroke-[1.75]" />
          <span className="text-base font-semibold tracking-tight">
            {localPending === "genomgang" ? "Startar…" : "Genomgång"}
          </span>
          <span className={modeSubtitleClass}>Steg för steg</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={openScan}
          className={cn(
            modeButtonClass,
            qrOpen && scopeAccent && "bg-primary/10",
          )}
        >
          <ScanSearch className="size-6 stroke-[1.75]" />
          <span className="text-base font-semibold tracking-tight">
            {localPending === "scan" ? "Startar…" : "Skanna mitt arbete"}
          </span>
          <span className={modeSubtitleClass}>Ladda upp från telefon</span>
        </Button>
      </div>

      <PhoneUploadDialog
        roomId={roomId}
        open={qrOpen}
        onOpenChange={(open) => {
          setQrOpen(open)
        }}
        onCompleted={handlePhotoUploaded}
        showTrigger={false}
      />
    </div>
  )
}
