import { useEffect, useState } from "react"
import { PDFViewer } from "@embedpdf/react-pdf-viewer"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet"

type PdfViewerSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  fileName: string | null
  url: string | null
}

export function PdfViewerSheet({
  open,
  onOpenChange,
  fileName,
  url,
}: PdfViewerSheetProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="gap-0 p-0 !max-w-none"
      >
        <SheetHeader className="border-b border-border pr-12">
          <SheetTitle className="truncate" title={fileName ?? undefined}>
            {fileName ?? "PDF"}
          </SheetTitle>
          <SheetDescription>Endast visning</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-hidden">
          {!url ? (
            <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
              Filen är otillgänglig.
            </div>
          ) : !mounted ? (
            <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
              Laddar visare…
            </div>
          ) : (
            <PDFViewer
              key={url}
              config={{
                src: url,
                theme: { preference: "light" },
                tabBar: "never",
                documentManager: {
                  maxDocuments: 1,
                },
                disabledCategories: [
                  "annotation",
                  "form",
                  "redaction",
                  "insert",
                  "document-open",
                  "document-print",
                  "document-export",
                  "document-capture",
                  "document-protect",
                  "history","document","panel-comment"
                ],
                permissions: {
                  overrides: {
                    modifyContents: false,
                    modifyAnnotations: false,
                    fillForms: false,
                    assembleDocument: false,
                  },
                },
              }}
              style={{ width: "100%", height: "100%" }}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function isPdfFile(name: string) {
  return name.toLowerCase().endsWith(".pdf")
}
