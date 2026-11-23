import { useAction, useQuery } from "convex/react"
import { Loader2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { MarkdownWithMath } from "~/components/lumo/markdown-with-math"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { cn } from "~/lib/utils"

type DecisionAction = "keep" | "replace" | "delete" | "add" | "skip"
type Presence = "both" | "liveOnly" | "previewOnly"

type SideSummary = {
  question: string
  answer: string
  flags: Array<{ kind: "needs_pdf" | "missing_answer"; data: Record<string, never> }>
  letters: Array<string>
  letterLabel: string
  sourceQuestionPageIdx: number | null
  sourceAnswerPageIdx: number | null
  questionImageCount: number
  answerImageCount: number
}

type DiffRow = {
  problemNumber: string
  presence: Presence
  contentChanged: boolean
  lettersChanged: boolean
  defaultAction: DecisionAction
  allowedActions: Array<DecisionAction>
  live: SideSummary | null
  preview: SideSummary | null
  shadowCount: number
}

const ACTION_LABEL: Record<DecisionAction, string> = {
  keep: "Behåll",
  replace: "Ersätt",
  delete: "Ta bort",
  add: "Lägg till",
  skip: "Hoppa över",
}

const PRESENCE_LABEL: Record<Presence, string> = {
  both: "Båda",
  liveOnly: "Endast sparad",
  previewOnly: "Endast ny",
}

function presenceBadgeClass(presence: Presence, changed: boolean): string {
  if (presence === "previewOnly") {
    return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
  }
  if (presence === "liveOnly") {
    return "bg-amber-500/15 text-amber-900 dark:text-amber-200"
  }
  if (changed) {
    return "bg-sky-500/15 text-sky-900 dark:text-sky-200"
  }
  return "bg-muted text-muted-foreground"
}

function actionButtonClass(selected: boolean, action: DecisionAction): string {
  if (!selected) return ""
  if (action === "delete") {
    return "border-destructive bg-destructive/10 text-destructive"
  }
  if (action === "replace" || action === "add") {
    return "border-sky-600 bg-sky-500/10 text-sky-900 dark:text-sky-200"
  }
  if (action === "skip") {
    return "border-muted-foreground/40 bg-muted"
  }
  return "border-foreground/40 bg-foreground/5"
}

export function PdfReparseDiffDialog({
  open,
  onOpenChange,
  runId,
  onPublished,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  runId: Id<"pdfAdminRuns"> | null
  onPublished?: () => void
}) {
  const getDiff = useAction(api.PDFParse.adminReparse.getDiff)
  const publishMerged = useAction(api.PDFParse.adminReparse.publishMerged)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<Array<DiffRow>>([])
  const [summary, setSummary] = useState<{
    bothUnchanged: number
    bothChanged: number
    liveOnly: number
    previewOnly: number
  } | null>(null)
  const [contentHash, setContentHash] = useState<string | null>(null)
  const [runName, setRunName] = useState<string>("")
  const [decisions, setDecisions] = useState<Record<string, DecisionAction>>({})
  const [selectedNumber, setSelectedNumber] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)

  useEffect(() => {
    if (!open || runId === null) {
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setConfirmOpen(false)
    void getDiff({ runId })
      .then((data) => {
        if (cancelled) return
        setRows(data.rows)
        setSummary(data.summary)
        setContentHash(data.contentHash)
        setRunName(data.runName)
        const next: Record<string, DecisionAction> = {}
        for (const row of data.rows) {
          next[row.problemNumber] = row.defaultAction
        }
        setDecisions(next)
        setSelectedNumber(data.rows[0]?.problemNumber ?? null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setRows([])
        setSummary(null)
        setContentHash(null)
        setError(err instanceof Error ? err.message : "Kunde inte ladda diff")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, runId, getDiff])

  const decisionList = useMemo(
    () =>
      rows.map((row) => ({
        problemNumber: row.problemNumber,
        action: decisions[row.problemNumber] ?? row.defaultAction,
      })),
    [rows, decisions],
  )

  const previewLettersByNumber = useMemo(
    () =>
      rows
        .filter((row) => row.preview !== null)
        .map((row) => ({
          problemNumber: row.problemNumber,
          letters: row.preview!.letters,
          question: row.preview!.question,
        })),
    [rows],
  )

  const impact = useQuery(
    api.PDFParse.adminReparse.estimateImpact,
    open && contentHash !== null && rows.length > 0
      ? {
          contentHash,
          decisions: decisionList,
          previewLettersByNumber,
        }
      : "skip",
  )

  const selected = rows.find((r) => r.problemNumber === selectedNumber) ?? null

  function setAction(problemNumber: string, action: DecisionAction) {
    setDecisions((prev) => ({ ...prev, [problemNumber]: action }))
  }

  function bulkSet(
    predicate: (row: DiffRow) => boolean,
    action: DecisionAction,
  ) {
    setDecisions((prev) => {
      const next = { ...prev }
      for (const row of rows) {
        if (!predicate(row)) continue
        if (!row.allowedActions.includes(action)) continue
        next[row.problemNumber] = action
      }
      return next
    })
  }

  async function handlePublish() {
    if (runId === null) return
    setPublishing(true)
    setError(null)
    try {
      await publishMerged({
        runId,
        decisions: decisionList,
      })
      setConfirmOpen(false)
      onOpenChange(false)
      onPublished?.()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Publicering misslyckades")
    } finally {
      setPublishing(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[min(90vh,52rem)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
          <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
            <DialogTitle>Diff & publicera</DialogTitle>
            <DialogDescription>
              Jämför sparade uppgifter med förhandsgranskningen
              {runName ? ` för ${runName}` : ""}. Välj behåll / ersätt / ta bort
              per nummer, sedan publicera den sammanslagna uppsättningen.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-hidden px-6 py-4">
            {loading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Bygger diff…
              </p>
            ) : error !== null && rows.length === 0 ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Inga uppgifter att jämföra
              </p>
            ) : (
              <div className="flex h-full min-h-0 flex-col gap-3">
                {summary !== null ? (
                  <p className="shrink-0 text-xs text-muted-foreground">
                    Oförändrade {summary.bothUnchanged} · Ändrade{" "}
                    {summary.bothChanged} · Endast sparade {summary.liveOnly} ·
                    Endast nya {summary.previewOnly}
                  </p>
                ) : null}

                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      bulkSet((r) => r.presence === "both" && r.contentChanged, "replace")
                    }
                  >
                    Ersätt alla ändrade
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => bulkSet(() => true, "keep")}
                  >
                    Behåll alla möjliga
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      bulkSet((r) => r.presence === "previewOnly", "add")
                    }
                  >
                    Lägg till alla nya
                  </Button>
                </div>

                <div className="grid min-h-0 flex-1 gap-3 overflow-hidden md:grid-cols-[14rem_minmax(0,1fr)]">
                  <ul className="min-h-0 max-h-[40vh] space-y-1 overflow-y-auto overscroll-contain rounded-md border border-border p-2 md:max-h-none md:h-full">
                    {rows.map((row) => {
                      const action =
                        decisions[row.problemNumber] ?? row.defaultAction
                      const selectedRow =
                        row.problemNumber === selectedNumber
                      return (
                        <li key={row.problemNumber}>
                          <button
                            type="button"
                            className={cn(
                              "flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                              selectedRow
                                ? "bg-accent text-accent-foreground"
                                : "hover:bg-muted/60",
                            )}
                            onClick={() =>
                              setSelectedNumber(row.problemNumber)
                            }
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span className="font-medium">
                                {row.problemNumber}
                              </span>
                              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                {ACTION_LABEL[action]}
                              </span>
                            </span>
                            <span
                              className={cn(
                                "w-fit rounded px-1.5 py-0.5 text-[10px] font-medium",
                                presenceBadgeClass(
                                  row.presence,
                                  row.contentChanged,
                                ),
                              )}
                            >
                              {row.presence === "both" && row.contentChanged
                                ? "Ändrad"
                                : PRESENCE_LABEL[row.presence]}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>

                  <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain rounded-md border border-border p-3">
                    {selected === null ? (
                      <p className="text-sm text-muted-foreground">
                        Välj en uppgift
                      </p>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold">
                            Uppgift {selected.problemNumber}
                          </h3>
                          {selected.lettersChanged ? (
                            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-900 dark:text-amber-200">
                              Deluppgiftsstruktur ändras
                            </span>
                          ) : null}
                          {selected.shadowCount > 0 ? (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                              {selected.shadowCount} tvillingar (raderas vid
                              publicering)
                            </span>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {selected.allowedActions.map((action) => {
                            const current =
                              decisions[selected.problemNumber] ??
                              selected.defaultAction
                            return (
                              <Button
                                key={action}
                                type="button"
                                size="sm"
                                variant="outline"
                                className={actionButtonClass(
                                  current === action,
                                  action,
                                )}
                                onClick={() =>
                                  setAction(selected.problemNumber, action)
                                }
                              >
                                {ACTION_LABEL[action]}
                              </Button>
                            )
                          })}
                        </div>

                        <div className="grid gap-3 lg:grid-cols-2">
                          <SidePanel
                            title="Sparad"
                            side={selected.live}
                            empty="Saknas i databasen"
                          />
                          <SidePanel
                            title="Ny parse"
                            side={selected.preview}
                            empty="Saknas i förhandsgranskningen"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border px-6 py-4">
            {error !== null && rows.length > 0 ? (
              <p className="mr-auto text-sm text-destructive">{error}</p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Avbryt
            </Button>
            <Button
              type="button"
              disabled={loading || rows.length === 0 || publishing}
              onClick={() => setConfirmOpen(true)}
            >
              Granska & publicera…
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bekräfta publicering</DialogTitle>
            <DialogDescription>
              Skriver en ny global uppsättning för denna content hash. Alla rum
              som delar PDF:en påverkas.
            </DialogDescription>
          </DialogHeader>

          {impact === undefined ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Beräknar påverkan…
            </p>
          ) : impact === null ? (
            <p className="text-sm text-destructive">Kunde inte beräkna påverkan</p>
          ) : (
            <ul className="space-y-1 text-sm">
              <li>
                Behåll {impact.keepCount} · Ersätt {impact.replaceCount} · Lägg
                till {impact.addCount} · Ta bort {impact.deleteCount} · Hoppa
                över {impact.skipCount}
              </li>
              <li>
                Föräldralösa stjärnor: {impact.orphanStars}, avklarade:{" "}
                {impact.orphanCompletions}, tillfällen:{" "}
                {impact.orphanAssignments}
              </li>
              <li>
                Tvillingar som raderas: {impact.shadowsDropped} (v1 remintar alla
                `_id`)
              </li>
              {impact.deleteCount > 0 ||
              impact.orphanStars +
                impact.orphanCompletions +
                impact.orphanAssignments >
                0 ? (
                <li className="text-amber-800 dark:text-amber-200">
                  Borttagna / ändrade deluppgifter kan lämna orphaned progress
                  (raderas inte automatiskt).
                </li>
              ) : null}
            </ul>
          )}

          {error !== null ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={publishing}
              onClick={() => setConfirmOpen(false)}
            >
              Tillbaka
            </Button>
            <Button
              type="button"
              disabled={publishing || impact === undefined || impact === null}
              onClick={() => {
                void handlePublish()
              }}
            >
              {publishing ? (
                <Loader2 className="animate-spin" />
              ) : null}
              Publicera
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function SidePanel({
  title,
  side,
  empty,
}: {
  title: string
  side: SideSummary | null
  empty: string
}) {
  if (side === null) {
    return (
      <div className="rounded-md border border-dashed border-border p-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <p className="text-sm text-muted-foreground">{empty}</p>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-border p-3">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <p className="text-xs text-muted-foreground">
        Struktur: {side.letterLabel}
        {side.flags.length > 0
          ? ` · flaggor: ${side.flags.map((f) => f.kind).join(", ")}`
          : ""}
        {side.questionImageCount > 0
          ? ` · ${side.questionImageCount} frågebilder`
          : ""}
        {side.answerImageCount > 0
          ? ` · ${side.answerImageCount} svarsbilder`
          : ""}
      </p>
      <p className="mt-2 text-xs font-medium text-muted-foreground">Fråga</p>
      <MarkdownWithMath
        className="text-sm"
        markdown={side.question.length > 0 ? side.question : "(tom)"}
      />
      <p className="mt-2 text-xs font-medium text-muted-foreground">Svar</p>
      <MarkdownWithMath
        className="text-sm"
        markdown={side.answer.length > 0 ? side.answer : "(tom)"}
      />
    </div>
  )
}
