import { useAction } from "convex/react"
import { Globe, Loader2 } from "lucide-react"
import { useState } from "react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"

type ImportSummary = {
  imported: number
  skipped: number
  failed: Array<{ name: string; reason: string }>
  pdfCount: number
}

export function ImportCourseSiteCard({ roomId }: { roomId: Id<"rooms"> }) {
  const importFromCourseSite = useAction(
    api.courseSiteImport.importFromCourseSite,
  )
  const [url, setUrl] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)

  async function handleImport() {
    setError(null)
    setSummary(null)
    setPending(true)
    try {
      const result = await importFromCourseSite({ roomId, url })
      setSummary(result)
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Kunde inte importera från kurshemsidan",
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="size-4" />
          Importera från kurshemsida
        </CardTitle>
        <CardDescription>
          Klistra in startsidan för en MAI-kurs (courses.mai.liu.se). Vi hämtar
          PDF:er från sidan och dess undersidor (djup 1) och lägger dem i
          mallrummet.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="space-y-2">
          <Label htmlFor="course-site-url">Kurshemside-URL</Label>
          <Input
            id="course-site-url"
            type="url"
            inputMode="url"
            placeholder="https://courses.mai.liu.se/GU/TATA41/"
            value={url}
            disabled={pending}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                if (!pending && url.trim()) {
                  void handleImport()
                }
              }
            }}
          />
          <p className="text-xs text-muted-foreground">
            Endast kursens startsida, t.ex.{" "}
            <span className="font-mono">
              https://courses.mai.liu.se/GU/TATA41/
            </span>
          </p>
        </div>

        <div>
          <Button
            disabled={pending || url.trim().length === 0}
            onClick={() => {
              void handleImport()
            }}
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Hämtar PDF:er…
              </>
            ) : (
              "Importera PDF:er"
            )}
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {summary ? (
          <div className="space-y-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <p>
              Hittade {summary.pdfCount} PDF-länkar · importerade{" "}
              {summary.imported}
              {summary.skipped > 0
                ? ` · hoppade över ${summary.skipped} (redan i rummet)`
                : ""}
              {summary.failed.length > 0
                ? ` · ${summary.failed.length} misslyckades`
                : ""}
              .
            </p>
            {summary.failed.length > 0 ? (
              <ul className="list-inside list-disc text-muted-foreground">
                {summary.failed.slice(0, 8).map((item) => (
                  <li key={`${item.name}-${item.reason}`}>
                    {item.name}: {item.reason}
                  </li>
                ))}
                {summary.failed.length > 8 ? (
                  <li>…och {summary.failed.length - 8} till</li>
                ) : null}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
