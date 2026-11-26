import { useAction, useMutation, useQuery } from "convex/react"
import { Download, Loader2, Upload } from "lucide-react"
import { useEffect, useRef, useState } from "react"
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
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import {
  buildSplitFixtureZip,
  downloadSplitFixtureZip,
} from "~/lib/split-fixture-zip"
import { uploadFileToStorage } from "~/lib/upload"

type Phase =
  | "idle"
  | "uploading"
  | "mineru"
  | "exporting"
  | "done"
  | "error"

export function SplitFixtureDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const generateUploadUrl = useMutation(
    api.PDFParse.adminParse.generateUploadUrl,
  )
  const registerFixturePdf = useMutation(
    api.PDFParse.adminParse.registerFixturePdf,
  )
  const ensureMineruForFixture = useAction(
    api.PDFParse.adminParse.ensureMineruForFixture,
  )
  const exportSplitFixture = useAction(
    api.PDFParse.adminParse.exportSplitFixture,
  )

  const [file, setFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<Phase>("idle")
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [contentHash, setContentHash] = useState<string | null>(null)
  const [storageId, setStorageId] = useState<Id<"_storage"> | null>(null)
  const [pdfName, setPdfName] = useState<string | null>(null)
  const [downloadedName, setDownloadedName] = useState<string | null>(null)
  const exportStarted = useRef(false)

  const mineruReady = useQuery(
    api.PDFParse.adminParse.getMineruCacheReady,
    contentHash !== null && phase === "mineru"
      ? { contentHash }
      : "skip",
  )

  useEffect(() => {
    if (!open) {
      setFile(null)
      setPhase("idle")
      setStatusMessage(null)
      setError(null)
      setContentHash(null)
      setStorageId(null)
      setPdfName(null)
      setDownloadedName(null)
      exportStarted.current = false
    }
  }, [open])

  useEffect(() => {
    if (phase !== "mineru" || contentHash === null || storageId === null) {
      return
    }
    if (mineruReady !== true || exportStarted.current) {
      return
    }
    exportStarted.current = true
    void finishExport(contentHash, pdfName ?? "document.pdf")
  }, [phase, mineruReady, contentHash, storageId, pdfName])

  async function finishExport(hash: string, name: string) {
    setPhase("exporting")
    setStatusMessage("Identifierar format och bygger fixture…")
    try {
      const bundle = await exportSplitFixture({
        contentHash: hash,
        name,
      })
      if (bundle === null) {
        throw new Error("MinerU-cachen saknas fortfarande")
      }
      const zipBytes = buildSplitFixtureZip({
        suggestedName: bundle.suggestedName,
        middle: bundle.middle,
        format: bundle.format,
        expected: bundle.expected,
      })
      downloadSplitFixtureZip(bundle.suggestedName, zipBytes)
      setDownloadedName(bundle.suggestedName)
      setPhase("done")
      setStatusMessage(null)
    } catch (err: unknown) {
      setPhase("error")
      setError(
        err instanceof Error ? err.message : "Kunde inte exportera fixture",
      )
    }
  }

  async function handleGenerate() {
    if (file === null) {
      setError("Välj en PDF först")
      return
    }
    setError(null)
    setDownloadedName(null)
    exportStarted.current = false
    setPhase("uploading")
    setStatusMessage("Laddar upp PDF…")
    try {
      const uploadedId = await uploadFileToStorage(file, () =>
        generateUploadUrl(),
      )
      const registered = await registerFixturePdf({
        storageId: uploadedId,
        name: file.name,
      })
      setStorageId(uploadedId)
      setContentHash(registered.contentHash)
      setPdfName(registered.name)

      setPhase("mineru")
      setStatusMessage("Tolkar PDF med MinerU (kan ta några minuter)…")
      const status = await ensureMineruForFixture({
        contentHash: registered.contentHash,
        storageId: uploadedId,
      })
      if (status === "ready") {
        exportStarted.current = true
        await finishExport(registered.contentHash, registered.name)
      }
    } catch (err: unknown) {
      setPhase("error")
      setError(err instanceof Error ? err.message : "Något gick fel")
    }
  }

  const busy =
    phase === "uploading" || phase === "mineru" || phase === "exporting"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dry-run fixture</DialogTitle>
          <DialogDescription>
            Ladda upp en PDF. När MinerU + format-detektering är klar laddas en
            zip ner med{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              &lt;namn&gt;/middle.json
            </code>
            ,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              format.json
            </code>{" "}
            och{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              expected.json
            </code>
            . Packa upp den i{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              convex/PDFParse/__fixtures__/
            </code>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fixture-pdf">PDF</Label>
            <Input
              id="fixture-pdf"
              type="file"
              accept="application/pdf,.pdf"
              disabled={busy}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null)
                setError(null)
                setDownloadedName(null)
                setPhase("idle")
              }}
            />
            {file !== null ? (
              <p className="text-xs text-muted-foreground">{file.name}</p>
            ) : null}
          </div>

          {statusMessage !== null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 shrink-0 animate-spin" />
              {statusMessage}
            </p>
          ) : null}

          {phase === "done" && downloadedName !== null ? (
            <p className="text-sm text-muted-foreground">
              Laddade ner{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                {downloadedName}.zip
              </code>
              . Extrahera till{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                convex/PDFParse/__fixtures__/
              </code>
              .
            </p>
          ) : null}

          {error !== null ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="mt-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Stäng
          </Button>
          <Button
            type="button"
            disabled={busy || file === null}
            onClick={() => {
              void handleGenerate()
            }}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : phase === "done" ? (
              <Download className="size-3.5" />
            ) : (
              <Upload className="size-3.5" />
            )}
            {phase === "done" ? "Generera igen" : "Generera & ladda ner zip"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
