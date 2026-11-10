import { useEffect, useRef, useState } from "react"
import { PDFViewer, type PluginRegistry } from "@embedpdf/react-pdf-viewer"
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
  /** 1-based page to jump to on load; omit/null opens at the start. */
  pageNumber?: number | null
}

export function PdfViewerSheet({
  open,
  onOpenChange,
  fileName,
  url,
  pageNumber = null,
}: PdfViewerSheetProps) {
  const [mounted, setMounted] = useState(false)
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    return () => {
      unsubscribeRef.current?.()
      unsubscribeRef.current = undefined
    }
  }, [url, pageNumber])

  const handleReady = (registry: PluginRegistry) => {
    unsubscribeRef.current?.()
    unsubscribeRef.current = undefined

    if (pageNumber == null || pageNumber < 1) {
      return
    }

    const scrollPlugin = registry.getPlugin("scroll")
    const scroll = scrollPlugin?.provides?.()
    if (scroll == null) {
      return
    }

    unsubscribeRef.current = scroll.onLayoutReady(
      (event: { isInitial: boolean }) => {
        if (!event.isInitial) return
        scroll.scrollToPage({
          pageNumber,
          behavior: "instant",
        })
      },
    )
  }

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
              key={`${url}:${pageNumber ?? "start"}`}
              onReady={handleReady}
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
