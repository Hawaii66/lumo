import { Link, useNavigate } from "@tanstack/react-router"
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useMutation,
  useQuery,
} from "convex/react"
import {
  ArrowLeft,
  ChevronDown,
  FileText,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react"
import { useEffect, useState } from "react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { ParsedProblemView } from "~/components/lumo/parsed-problem"
import { PdfViewerSheet } from "~/components/rooms/pdf-viewer-sheet"
import { SignInCard } from "~/components/sign-in"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Switch } from "~/components/ui/switch"
import type { LumoParsedProblem } from "~/lib/lumo-content"
import { cn } from "~/lib/utils"
import { uploadFileToStorage } from "~/lib/upload"

type ParseKind = "problems" | "info"
type FromStage = "mineru" | "ai" | "commit"

type PreviewProblems = {
  kind: "problems"
  problems: Array<LumoParsedProblem>
}

type PreviewInfo = {
  kind: "info"
  text: string
}

type PreviewPayload = PreviewProblems | PreviewInfo

type AdminProblemItem = {
  id: string
  problem: LumoParsedProblem
}

function AdminProblemBrowser({
  problems,
  emptyLabel,
  pdfFileName,
  pdfUrl,
  onViewPdf,
}: {
  problems: Array<AdminProblemItem>
  emptyLabel: string
  pdfFileName: string
  pdfUrl: string | null
  /** Optional 1-based pageNumber jumps into the PDF. */
  onViewPdf: (pageNumber?: number) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showFacit, setShowFacit] = useState(true)

  useEffect(() => {
    if (problems.length === 0) {
      setSelectedId(null)
      return
    }
    if (
      selectedId === null ||
      !problems.some((problem) => problem.id === selectedId)
    ) {
      setSelectedId(problems[0]!.id)
    }
  }, [problems, selectedId])

  const selected =
    problems.find((problem) => problem.id === selectedId) ?? null
  const needsPdf =
    selected?.problem.flags?.some((flag) => flag.kind === "needs_pdf") ===
      true && (selected.problem.questionImages?.length ?? 0) === 0
  const questionPageIdx = selected?.problem.sourceQuestionPageIdx
  const answerPageIdx = selected?.problem.sourceAnswerPageIdx

  if (problems.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>
  }

  return (
    <div className="grid min-h-[28rem] gap-4 md:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
      <div
        className="flex max-h-[28rem] flex-col gap-0.5 overflow-y-auto rounded-md border border-border p-1"
        aria-label="Uppgiftslista"
      >
        {problems.map((item) => {
          const active = item.id === selectedId
          const flagCount = item.problem.flags?.length ?? 0
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedId(item.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "hover:bg-muted",
              )}
            >
              <span className="min-w-0 flex-1 truncate tabular-nums">
                {item.problem.problemNumber}
              </span>
              {flagCount > 0 ? (
                <span
                  className={cn(
                    "shrink-0 rounded px-1 py-px text-[10px] font-medium tabular-nums",
                    active
                      ? "bg-sidebar-primary-foreground/15"
                      : "bg-amber-500/15 text-amber-950 dark:text-amber-100",
                  )}
                >
                  {flagCount}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="flex min-h-0 min-w-0 flex-col gap-3">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <p className="truncate text-sm text-muted-foreground" title={pdfFileName}>
            {pdfFileName}
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={
                    needsPdf
                      ? "gap-1.5 border-amber-500/40 bg-amber-500/5 text-amber-950 hover:bg-amber-500/10 dark:text-amber-100"
                      : "gap-1.5"
                  }
                  disabled={pdfUrl === null}
                />
              }
            >
              <FileText className="size-3.5" />
              Visa original
              <ChevronDown className="size-3.5 opacity-60" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem
                disabled={pdfUrl === null}
                onClick={() => onViewPdf()}
              >
                Öppna
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={pdfUrl === null || questionPageIdx == null}
                onClick={() => {
                  if (questionPageIdx == null) return
                  onViewPdf(questionPageIdx + 1)
                }}
              >
                Öppna fråga
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={pdfUrl === null || answerPageIdx == null}
                onClick={() => {
                  if (answerPageIdx == null) return
                  onViewPdf(answerPageIdx + 1)
                }}
              >
                Öppna svar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {selected === null ? (
          <p className="text-sm text-muted-foreground">
            Välj en uppgift i listan.
          </p>
        ) : (
          <div className="min-h-0 max-h-[28rem] flex-1 overflow-y-auto pr-1">
            <ParsedProblemView
              problem={selected.problem}
              showAnswer={showFacit}
              showFacitToggle
              onShowAnswerChange={setShowFacit}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function useIsAdmin() {
  const viewer = useQuery(api.users.viewer)
  if (viewer === undefined) return undefined
  if (viewer === null) return false
  return viewer.role.key === "admin"
}

function formatTime(at: number) {
  return new Date(at).toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function formatStatus(status: string) {
  if (status === "pending") return "Väntar"
  if (status === "running") return "Pågår"
  if (status === "done") return "Klar"
  if (status === "failed") return "Misslyckades"
  return status
}

function shortHash(hash: string) {
  return hash.length <= 12 ? hash : `${hash.slice(0, 10)}…`
}

export function PdfParseLabPage() {
  const isAdmin = useIsAdmin()
  const navigate = useNavigate()

  useEffect(() => {
    if (isAdmin === false) {
      void navigate({ to: "/profile", search: { tab: "admin" } })
    }
  }, [isAdmin, navigate])

  if (isAdmin === undefined) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-sm text-muted-foreground">Kontrollerar behörighet…</p>
      </main>
    )
  }

  if (isAdmin === false) {
    return null
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          render={<Link to="/profile" search={{ tab: "admin" }} />}
        >
          <ArrowLeft />
          Admin
        </Button>
      </div>
      <h1 className="text-4xl font-semibold tracking-tight">PDF-tolkning</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Ladda upp PDF:er, följ MinerU/AI-status och iterera utan att behöva
        spara till databasen.
      </p>

      <AuthLoading>
        <p className="mt-8 text-sm text-muted-foreground">Laddar…</p>
      </AuthLoading>
      <Unauthenticated>
        <div className="mt-8">
          <SignInCard />
        </div>
      </Unauthenticated>
      <Authenticated>
        <LabBody />
      </Authenticated>
    </main>
  )
}

function LabBody() {
  const runs = useQuery(api.PDFParse.adminParse.listRecentRuns)
  const generateUploadUrl = useMutation(
    api.PDFParse.adminParse.generateUploadUrl,
  )
  const createRun = useMutation(api.PDFParse.adminParse.createRun)
  const restart = useMutation(api.PDFParse.adminParse.restart)
  const invalidateMineru = useMutation(
    api.PDFParse.adminParse.invalidateMineruCache,
  )

  const [selectedRunId, setSelectedRunId] = useState<Id<"pdfAdminRuns"> | null>(
    null,
  )
  const [file, setFile] = useState<File | null>(null)
  const [kind, setKind] = useState<ParseKind>("problems")
  const [commitToDb, setCommitToDb] = useState(false)
  const [invalidateOnStart, setInvalidateOnStart] = useState(false)
  const [starting, setStarting] = useState(false)
  const [viewingPdf, setViewingPdf] = useState<{
    name: string
    url: string
    /** 1-based EmbedPDF page; omit to open at the start. */
    pageNumber?: number
  } | null>(null)
  const [restarting, setRestarting] = useState<FromStage | null>(null)
  const [restartCommit, setRestartCommit] = useState(false)
  const [restartInvalidate, setRestartInvalidate] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invalidating, setInvalidating] = useState(false)

  const detail = useQuery(
    api.PDFParse.adminParse.getRunDetail,
    selectedRunId !== null ? { runId: selectedRunId } : "skip",
  )

  const [preview, setPreview] = useState<PreviewPayload | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    if (runs !== undefined && runs.length > 0 && selectedRunId === null) {
      setSelectedRunId(runs[0]!._id)
    }
  }, [runs, selectedRunId])

  useEffect(() => {
    if (detail?.run) {
      setRestartCommit(detail.run.commitToDb)
    }
  }, [detail?.run?._id, detail?.run?.commitToDb])

  useEffect(() => {
    const url = detail?.previewUrl ?? null
    if (url === null) {
      setPreview(null)
      setPreviewLoading(false)
      return
    }
    let cancelled = false
    setPreviewLoading(true)
    void fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error("Kunde inte hämta förhandsgranskning")
        return (await res.json()) as PreviewPayload
      })
      .then((data) => {
        if (!cancelled) setPreview(data)
      })
      .catch(() => {
        if (!cancelled) setPreview(null)
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [detail?.previewUrl])

  async function handleStart() {
    if (file === null) {
      setError("Välj en PDF först")
      return
    }
    setError(null)
    setStarting(true)
    try {
      const storageId = await uploadFileToStorage(file, () =>
        generateUploadUrl(),
      )
      const runId = await createRun({
        storageId,
        name: file.name,
        kind,
        commitToDb,
        invalidateMineru: invalidateOnStart,
      })
      setSelectedRunId(runId)
      setFile(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Kunde inte starta")
    } finally {
      setStarting(false)
    }
  }

  async function handleRestart(fromStage: FromStage) {
    if (selectedRunId === null) return
    setError(null)
    setRestarting(fromStage)
    try {
      await restart({
        runId: selectedRunId,
        fromStage,
        commitToDb: restartCommit,
        invalidateMineru:
          fromStage === "mineru" ? restartInvalidate : undefined,
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Kunde inte starta om")
    } finally {
      setRestarting(null)
    }
  }

  async function handleInvalidateCache() {
    if (detail === null || detail === undefined) return
    setError(null)
    setInvalidating(true)
    try {
      await invalidateMineru({ contentHash: detail.run.contentHash })
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Kunde inte rensa MinerU-cache",
      )
    } finally {
      setInvalidating(false)
    }
  }

  const runActive =
    detail?.run !== undefined &&
    (detail.run.status === "pending" || detail.run.status === "running")

  return (
    <div className="mt-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Ny körning</CardTitle>
          <CardDescription>
            Ladda upp en PDF och starta tolkning. Av som standard sparas inget
            till databasen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="admin-pdf">PDF</Label>
            <Input
              id="admin-pdf"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => {
                const next = e.target.files?.[0] ?? null
                setFile(next)
                setError(null)
              }}
            />
            {file !== null ? (
              <p className="text-xs text-muted-foreground">{file.name}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={kind === "problems" ? "default" : "outline"}
              onClick={() => setKind("problems")}
            >
              Uppgifter
            </Button>
            <Button
              type="button"
              size="sm"
              variant={kind === "info" ? "default" : "outline"}
              onClick={() => setKind("info")}
            >
              Information
            </Button>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2">
            <div>
              <p className="text-sm font-medium">Spara till databasen</p>
              <p className="text-xs text-muted-foreground">
                Av = endast förhandsgranskning
              </p>
            </div>
            <Switch
              checked={commitToDb}
              onCheckedChange={setCommitToDb}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border-border"
              checked={invalidateOnStart}
              onChange={(e) => setInvalidateOnStart(e.target.checked)}
            />
            Rensa MinerU-cache innan start
          </label>

          <Button
            disabled={starting || file === null}
            onClick={() => {
              void handleStart()
            }}
          >
            {starting ? (
              <>
                <Loader2 className="animate-spin" />
                Startar…
              </>
            ) : (
              <>
                <Upload />
                Starta tolkning
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Senaste körningar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {runs === undefined ? (
              <p className="text-sm text-muted-foreground">Hämtar…</p>
            ) : runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga körningar ännu</p>
            ) : (
              runs.map((run) => {
                const selected = run._id === selectedRunId
                return (
                  <button
                    key={run._id}
                    type="button"
                    onClick={() => setSelectedRunId(run._id)}
                    className={`w-full rounded-md px-2 py-2 text-left text-sm transition-colors ${
                      selected
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                  >
                    <p className="truncate font-medium">{run.name}</p>
                    <p
                      className={`text-xs ${selected ? "opacity-80" : "text-muted-foreground"}`}
                    >
                      {formatStatus(run.status)} · {run.kind} ·{" "}
                      {run.commitToDb ? "commit" : "dry-run"}
                    </p>
                  </button>
                )
              })
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {selectedRunId === null ? (
            <Card>
              <CardHeader>
                <CardTitle>Detaljer</CardTitle>
                <CardDescription>Välj en körning till vänster.</CardDescription>
              </CardHeader>
            </Card>
          ) : detail === undefined ? (
            <Card>
              <CardHeader>
                <CardTitle>Detaljer</CardTitle>
                <CardDescription>Hämtar…</CardDescription>
              </CardHeader>
            </Card>
          ) : detail === null ? (
            <Card>
              <CardHeader>
                <CardTitle>Detaljer</CardTitle>
                <CardDescription>Körningen hittades inte.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="size-5" />
                    <span className="truncate">{detail.run.name}</span>
                  </CardTitle>
                  <CardDescription>
                    {shortHash(detail.run.contentHash)} · stage{" "}
                    {detail.run.stage} · {formatStatus(detail.run.status)}
                    {detail.run.problemCount !== null
                      ? ` · ${detail.run.problemCount} uppgifter`
                      : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span>
                      MinerU-cache:{" "}
                      <span className="font-medium">
                        {detail.mineruCached ? "finns" : "saknas"}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={detail.pdfUrl === null}
                      onClick={() => {
                        if (detail.pdfUrl === null) return
                        setViewingPdf({
                          name: detail.run.name,
                          url: detail.pdfUrl,
                        })
                      }}
                    >
                      <FileText className="size-3.5" />
                      Visa PDF
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={invalidating || !detail.mineruCached}
                      onClick={() => {
                        void handleInvalidateCache()
                      }}
                    >
                      {invalidating ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Trash2 />
                      )}
                      Rensa cache
                    </Button>
                  </div>

                  <ul className="max-h-48 space-y-1.5 overflow-y-auto rounded-md border border-border bg-muted/30 p-2">
                    {detail.run.statusUpdates.map((update, index) => (
                      <li
                        key={`${update.at}-${index}`}
                        className="flex gap-2 text-xs"
                      >
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {formatTime(update.at)}
                        </span>
                        <span>{update.message}</span>
                      </li>
                    ))}
                  </ul>
                  {runActive ? (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" />
                      Uppdateras live…
                    </p>
                  ) : null}
                  {detail.run.error !== null ? (
                    <p className="text-sm text-destructive">{detail.run.error}</p>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Starta om</CardTitle>
                  <CardDescription>
                    Kör om från valfri sparad etapp. Commit skriver senaste
                    förhandsgranskning till databasen.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">Spara till databasen</p>
                      <p className="text-xs text-muted-foreground">
                        Gäller omstart från MinerU/AI
                      </p>
                    </div>
                    <Switch
                      checked={restartCommit}
                      onCheckedChange={setRestartCommit}
                      disabled={runActive}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-border"
                      checked={restartInvalidate}
                      disabled={runActive}
                      onChange={(e) => setRestartInvalidate(e.target.checked)}
                    />
                    Rensa MinerU-cache vid omstart från MinerU
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={runActive || restarting !== null}
                      onClick={() => {
                        void handleRestart("mineru")
                      }}
                    >
                      {restarting === "mineru" ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <RefreshCw />
                      )}
                      Från MinerU
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        runActive ||
                        restarting !== null ||
                        !detail.mineruCached
                      }
                      onClick={() => {
                        void handleRestart("ai")
                      }}
                    >
                      {restarting === "ai" ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <RefreshCw />
                      )}
                      Från AI
                    </Button>
                    <Button
                      size="sm"
                      disabled={
                        runActive ||
                        restarting !== null ||
                        detail.run.previewStorageId === null
                      }
                      onClick={() => {
                        void handleRestart("commit")
                      }}
                    >
                      {restarting === "commit" ? (
                        <Loader2 className="animate-spin" />
                      ) : null}
                      Committa förhandsgranskning
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Förhandsgranskning
                  </CardTitle>
                  <CardDescription>
                    Senaste parse-resultat (dry-run eller före commit).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {previewLoading ? (
                    <p className="text-sm text-muted-foreground">Hämtar…</p>
                  ) : preview === null ? (
                    <p className="text-sm text-muted-foreground">
                      Ingen förhandsgranskning ännu
                    </p>
                  ) : preview.kind === "info" ? (
                    <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-xs">
                      {preview.text || "(tom)"}
                    </pre>
                  ) : (
                    <AdminProblemBrowser
                      problems={preview.problems.map((p) => ({
                        id: p.problemNumber,
                        problem: p,
                      }))}
                      emptyLabel="Inga uppgifter i förhandsgranskningen"
                      pdfFileName={detail.run.name}
                      pdfUrl={detail.pdfUrl}
                      onViewPdf={(pageNumber) => {
                        if (detail.pdfUrl === null) return
                        setViewingPdf({
                          name: detail.run.name,
                          url: detail.pdfUrl,
                          ...(pageNumber !== undefined ? { pageNumber } : {}),
                        })
                      }}
                    />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Sparat i databasen
                  </CardTitle>
                  <CardDescription>
                    Globalt innehåll för samma content hash
                    {detail.run.kind === "problems"
                      ? ` · ${detail.committedProblemCount} uppgifter`
                      : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {detail.run.kind === "info" ? (
                    detail.committedInfoText === null ? (
                      <p className="text-sm text-muted-foreground">
                        Ingen sparad information
                      </p>
                    ) : (
                      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-xs">
                        {detail.committedInfoText}
                      </pre>
                    )
                  ) : (
                    <AdminProblemBrowser
                      problems={detail.committedProblems.map((p) => ({
                        id: p._id,
                        problem: {
                          problemNumber: p.problemNumber,
                          question: p.problem,
                          answer: p.answer,
                          flags: p.flags,
                          ...(p.sourceQuestionPageIdx != null
                            ? {
                                sourceQuestionPageIdx:
                                  p.sourceQuestionPageIdx,
                              }
                            : {}),
                          ...(p.sourceAnswerPageIdx != null
                            ? {
                                sourceAnswerPageIdx: p.sourceAnswerPageIdx,
                              }
                            : {}),
                        },
                      }))}
                      emptyLabel="Inga sparade uppgifter"
                      pdfFileName={detail.run.name}
                      pdfUrl={detail.pdfUrl}
                      onViewPdf={(pageNumber) => {
                        if (detail.pdfUrl === null) return
                        setViewingPdf({
                          name: detail.run.name,
                          url: detail.pdfUrl,
                          ...(pageNumber !== undefined ? { pageNumber } : {}),
                        })
                      }}
                    />
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {error !== null ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <PdfViewerSheet
        open={viewingPdf !== null}
        onOpenChange={(open) => {
          if (!open) setViewingPdf(null)
        }}
        fileName={viewingPdf?.name ?? null}
        url={viewingPdf?.url ?? null}
        pageNumber={viewingPdf?.pageNumber ?? null}
      />
    </div>
  )
}
