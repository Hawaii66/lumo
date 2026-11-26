import { useMutation } from "convex/react"
import { Flag } from "lucide-react"
import { useState } from "react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Label } from "~/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Textarea } from "~/components/ui/textarea"
import { celebrateSuccess } from "~/lib/celebrate"
import {
  MAX_REPORT_DETAILS_LENGTH,
  PROBLEM_REPORT_REASON_OPTIONS,
  type ProblemReportReason,
} from "~/lib/problem-reports"

type ReportProblemDialogProps = {
  roomId: Id<"rooms">
  problemId: Id<"problems">
  problemNumber: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ReportProblemDialog({
  roomId,
  problemId,
  problemNumber,
  open,
  onOpenChange,
}: ReportProblemDialogProps) {
  const createReport = useMutation(api.problemReports.create)
  const [reason, setReason] = useState<ProblemReportReason | null>(null)
  const [details, setDetails] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const selectedReasonLabel = PROBLEM_REPORT_REASON_OPTIONS.find(
    (option) => option.value === reason,
  )?.label

  function resetForm() {
    setReason(null)
    setDetails("")
    setError(null)
    setSubmitting(false)
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      resetForm()
    }
    onOpenChange(next)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (reason === null) {
      setError("Välj en anledning")
      return
    }
    const trimmed = details.trim()
    if (trimmed.length === 0) {
      setError("Skriv en kort beskrivning")
      return
    }
    if (trimmed.length > MAX_REPORT_DETAILS_LENGTH) {
      setError(`Beskrivningen är för lång (max ${MAX_REPORT_DETAILS_LENGTH})`)
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await createReport({
        roomId,
        problemId,
        reason,
        details: trimmed,
      })
      celebrateSuccess()
      handleOpenChange(false)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Kunde inte skicka rapporten",
      )
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(event) => void handleSubmit(event)}>
          <DialogHeader>
            <DialogTitle>Rapportera uppgift {problemNumber}</DialogTitle>
            <DialogDescription>
              Berätta vad som är fel så att vi kan rätta till det.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="report-reason">Anledning</Label>
              <Select
                items={PROBLEM_REPORT_REASON_OPTIONS}
                value={reason ?? undefined}
                onValueChange={(next) => {
                  if (next == null) return
                  setReason(next)
                }}
              >
                <SelectTrigger id="report-reason" className="w-full">
                  <SelectValue placeholder="Välj anledning">
                    {selectedReasonLabel}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PROBLEM_REPORT_REASON_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="report-details">Beskrivning</Label>
              <Textarea
                id="report-details"
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                placeholder="Beskriv problemet så tydligt du kan…"
                rows={4}
                maxLength={MAX_REPORT_DETAILS_LENGTH}
              />
              <p className="text-xs text-muted-foreground">
                {details.trim().length}/{MAX_REPORT_DETAILS_LENGTH}
              </p>
            </div>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Avbryt
            </Button>
            <Button type="submit" disabled={submitting} className="gap-1.5">
              <Flag className="size-3.5" />
              {submitting ? "Skickar…" : "Skicka rapport"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
