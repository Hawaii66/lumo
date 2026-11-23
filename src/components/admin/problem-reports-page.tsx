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
  Check,
  Flag,
  Loader2,
  Trash2,
  X,
} from "lucide-react"
import { useEffect, useState } from "react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { MarkdownWithMath } from "~/components/lumo/markdown-with-math"
import { SignInCard } from "~/components/sign-in"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Label } from "~/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { Textarea } from "~/components/ui/textarea"
import {
  PROBLEM_REPORT_STATUS_LABELS,
  type ProblemReportStatus,
} from "~/lib/problem-reports"
import { cn } from "~/lib/utils"

function useIsAdmin() {
  const viewer = useQuery(api.users.viewer)
  if (viewer === undefined) return undefined
  if (viewer === null) return false
  return viewer.role.key === "admin"
}

function formatRelativeTime(ms: number): string {
  const delta = Date.now() - ms
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 1) return "nyss"
  if (minutes < 60) return `${minutes} min sedan`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h sedan`
  const days = Math.floor(hours / 24)
  return `${days} d sedan`
}

export function ProblemReportsPage() {
  const navigate = useNavigate()
  const isAdmin = useIsAdmin()
  const [status, setStatus] = useState<ProblemReportStatus>("open")
  const [selectedId, setSelectedId] = useState<Id<"problemReports"> | null>(
    null,
  )

  useEffect(() => {
    if (isAdmin === false) {
      void navigate({ to: "/profile", search: { tab: "admin" } })
    }
  }, [isAdmin, navigate])

  useEffect(() => {
    setSelectedId(null)
  }, [status])

  if (isAdmin === undefined || isAdmin === false) {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-6 px-4 py-8">
        <p className="text-sm text-muted-foreground">Kontrollerar behörighet…</p>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 px-0"
            render={<Link to="/profile" search={{ tab: "admin" }} />}
          >
            <ArrowLeft className="size-3.5" />
            Tillbaka till admin
          </Button>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Flag className="size-6" />
            Rapporterade uppgifter
          </h1>
          <p className="text-sm text-muted-foreground">
            Triagera rapporter och hotfixa markdown vid behov.
          </p>
        </div>
      </div>

      <AuthLoading>
        <p className="text-sm text-muted-foreground">Laddar…</p>
      </AuthLoading>
      <Unauthenticated>
        <SignInCard />
      </Unauthenticated>
      <Authenticated>
        <Tabs
          value={status}
          onValueChange={(value) => {
            if (
              value === "open" ||
              value === "resolved" ||
              value === "dismissed"
            ) {
              setStatus(value)
            }
          }}
        >
          <TabsList>
            <TabsTrigger value="open">
              {PROBLEM_REPORT_STATUS_LABELS.open}
            </TabsTrigger>
            <TabsTrigger value="resolved">
              {PROBLEM_REPORT_STATUS_LABELS.resolved}
            </TabsTrigger>
            <TabsTrigger value="dismissed">
              {PROBLEM_REPORT_STATUS_LABELS.dismissed}
            </TabsTrigger>
          </TabsList>
          <TabsContent value={status} className="mt-4">
            <ReportsInbox
              status={status}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </TabsContent>
        </Tabs>
      </Authenticated>
    </main>
  )
}

function ReportsInbox({
  status,
  selectedId,
  onSelect,
}: {
  status: ProblemReportStatus
  selectedId: Id<"problemReports"> | null
  onSelect: (id: Id<"problemReports"> | null) => void
}) {
  const reports = useQuery(api.problemReports.listForAdmin, { status })

  if (reports === undefined) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Hämtar rapporter…
      </div>
    )
  }

  if (reports.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Inga rapporter</CardTitle>
          <CardDescription>
            {status === "open"
              ? "Inga öppna rapporter just nu."
              : status === "resolved"
                ? "Inga lösta rapporter just nu."
                : "Inga avvisade rapporter just nu."}
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <ul className="space-y-2">
        {reports.map((report) => {
          const selected = report._id === selectedId
          return (
            <li key={report._id}>
              <button
                type="button"
                onClick={() => onSelect(report._id)}
                className={cn(
                  "w-full rounded-lg border px-3 py-3 text-left transition-colors",
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/40",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {report.problemNumber}
                      {report.isShadow ? " (tvilling)" : ""}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {report.reasonLabel} · {report.roomName}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatRelativeTime(report._creationTime)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm">{report.details}</p>
              </button>
            </li>
          )
        })}
      </ul>

      {selectedId !== null ? (
        <ReportDetail
          reportId={selectedId}
          onDeleted={() => onSelect(null)}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Välj en rapport</CardTitle>
            <CardDescription>
              Klicka på en rad till vänster för att triagera eller hotfixa.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  )
}

function ReportDetail({
  reportId,
  onDeleted,
}: {
  reportId: Id<"problemReports">
  onDeleted: () => void
}) {
  const detail = useQuery(api.problemReports.getForAdmin, { reportId })
  const setStatus = useMutation(api.problemReports.setStatus)
  const removeReport = useMutation(api.problemReports.remove)
  const hotfix = useMutation(api.problemReports.hotfixProblem)

  const [problemMarkdown, setProblemMarkdown] = useState("")
  const [answerMarkdown, setAnswerMarkdown] = useState("")
  const [adminNote, setAdminNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    if (detail === undefined || detail === null) return
    setProblemMarkdown(detail.problemMarkdown)
    setAnswerMarkdown(detail.answerMarkdown)
    setAdminNote(detail.adminNote ?? "")
    setError(null)
    setShowPreview(false)
  }, [detail])

  if (detail === undefined) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Hämtar detaljer…
      </div>
    )
  }

  if (detail === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Rapporten hittades inte</CardTitle>
        </CardHeader>
      </Card>
    )
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Uppgift {detail.problemNumber}
          {detail.isShadow ? " (tvilling)" : ""}
        </CardTitle>
        <CardDescription>
          {detail.reasonLabel} · {detail.roomName}
          {detail.fileName ? ` · ${detail.fileName}` : ""}
          {detail.contentHash === null
            ? ""
            : " · Delad cache (hotfix påverkar alla rum)"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Reporter: </span>
            {detail.reporterName ?? "Okänd"}
            {detail.reporterEmail ? ` (${detail.reporterEmail})` : ""}
          </p>
          <p>
            <span className="text-muted-foreground">Status: </span>
            {PROBLEM_REPORT_STATUS_LABELS[detail.status]}
          </p>
          <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3">
            {detail.details}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="admin-note">Adminanteckning</Label>
          <Textarea
            id="admin-note"
            value={adminNote}
            onChange={(event) => setAdminNote(event.target.value)}
            rows={2}
            placeholder="Valfri anteckning…"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {detail.status !== "resolved" ? (
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  setStatus({
                    reportId,
                    status: "resolved",
                    adminNote,
                  }),
                )
              }
            >
              <Check className="size-3.5" />
              Markera som löst
            </Button>
          ) : null}
          {detail.status !== "dismissed" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  setStatus({
                    reportId,
                    status: "dismissed",
                    adminNote,
                  }),
                )
              }
            >
              <X className="size-3.5" />
              Avvisa
            </Button>
          ) : null}
          {detail.status !== "open" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  setStatus({
                    reportId,
                    status: "open",
                    adminNote,
                  }),
                )
              }
            >
              Återöppna
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="gap-1.5"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await removeReport({ reportId })
                onDeleted()
              })
            }
          >
            <Trash2 className="size-3.5" />
            Ta bort rapport
          </Button>
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium">Hotfix markdown</h3>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowPreview((prev) => !prev)}
            >
              {showPreview ? "Visa editor" : "Visa förhandsvisning"}
            </Button>
          </div>

          {showPreview ? (
            <div className="space-y-4 rounded-lg border border-border p-3">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Uppgift
                </p>
                <MarkdownWithMath markdown={problemMarkdown} />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Facit
                </p>
                <MarkdownWithMath markdown={answerMarkdown || "*(tomt)*"} />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="hotfix-problem">Uppgift</Label>
                <Textarea
                  id="hotfix-problem"
                  value={problemMarkdown}
                  onChange={(event) => setProblemMarkdown(event.target.value)}
                  rows={8}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hotfix-answer">Facit</Label>
                <Textarea
                  id="hotfix-answer"
                  value={answerMarkdown}
                  onChange={(event) => setAnswerMarkdown(event.target.value)}
                  rows={6}
                  className="font-mono text-sm"
                />
              </div>
            </div>
          )}

          <Button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(() =>
                hotfix({
                  reportId,
                  problem: problemMarkdown,
                  answer: answerMarkdown,
                  adminNote:
                    adminNote.trim().length > 0
                      ? adminNote
                      : "Hotfix: markdown uppdaterad",
                }),
              )
            }
          >
            Spara hotfix och markera löst
          </Button>
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
