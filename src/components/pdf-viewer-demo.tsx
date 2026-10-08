import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { PDFViewer, type PDFViewerRef } from "@embedpdf/react-pdf-viewer"
import { FileUp } from "lucide-react"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Label } from "~/components/ui/label"

export function PdfViewerDemo() {
  const viewerRef = useRef<PDFViewerRef>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [mounted, setMounted] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      setError("Välj en PDF-fil.")
      event.target.value = ""
      return
    }

    setLoading(true)
    setError(null)

    try {
      const buffer = await file.arrayBuffer()
      const registry = await viewerRef.current?.registry
      if (!registry) {
        throw new Error("PDF-visaren är inte redo ännu.")
      }

      const plugin = registry.getPlugin("document-manager")
      const docManager = plugin?.provides?.()
      if (!docManager) {
        throw new Error("Kunde inte öppna dokumenthanteraren.")
      }

      docManager.openDocumentBuffer({
        buffer,
        name: file.name,
        autoActivate: true,
      })

      setFileName(file.name)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Kunde inte läsa PDF-filen.",
      )
      setFileName(null)
    } finally {
      setLoading(false)
      event.target.value = ""
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>PDF-förhandsvisning</CardTitle>
        <CardDescription>
          Ladda upp en PDF lokalt — filen stannar i webbläsaren
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            id="pdf-upload"
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={handleFileSelect}
          />
          <Button
            type="button"
            variant="outline"
            disabled={!mounted || loading}
            onClick={() => inputRef.current?.click()}
          >
            <FileUp data-icon="inline-start" />
            {loading ? "Öppnar…" : "Välj PDF"}
          </Button>
          {fileName ? (
            <Label htmlFor="pdf-upload" className="text-muted-foreground">
              {fileName}
            </Label>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ingen fil vald
            </p>
          )}
        </div>

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="h-[480px] w-full overflow-hidden rounded-lg border border-border">
          {mounted ? (
            <PDFViewer
              ref={viewerRef}
              config={{
                theme: { preference: "light" },
                tabBar: "never",
                documentManager: {
                  maxDocuments: 1,
                },
              }}
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Laddar visare…
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
