import { useMemo } from "react"
import { createPluginRegistration } from "@embedpdf/core"
import { EmbedPDF } from "@embedpdf/core/react"
import type { PdfEngine } from "@embedpdf/models"
import {
  DocumentContent,
  DocumentManagerPluginPackage,
} from "@embedpdf/plugin-document-manager/react"
import { Viewport, ViewportPluginPackage } from "@embedpdf/plugin-viewport/react"
import { Scroller, ScrollPluginPackage } from "@embedpdf/plugin-scroll/react"
import { RenderLayer, RenderPluginPackage } from "@embedpdf/plugin-render/react"

type PdfPreviewProps = {
  url: string
  engine: PdfEngine
  className?: string
}

export function PdfPreview({ url, engine, className }: PdfPreviewProps) {
  const plugins = useMemo(
    () => [
      createPluginRegistration(DocumentManagerPluginPackage, {
        initialDocuments: [{ url, scale: 0.35 }],
        maxDocuments: 1,
      }),
      createPluginRegistration(ViewportPluginPackage),
      createPluginRegistration(ScrollPluginPackage),
      createPluginRegistration(RenderPluginPackage),
    ],
    [url],
  )

  return (
    <div className={className}>
      <EmbedPDF engine={engine} plugins={plugins}>
        {({ activeDocumentId }) =>
          activeDocumentId ? (
            <DocumentContent documentId={activeDocumentId}>
              {({ isLoaded, isLoading, isError }) => {
                if (isLoading) {
                  return (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      Laddar…
                    </div>
                  )
                }

                if (isError) {
                  return (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      Kunde inte förhandsvisa
                    </div>
                  )
                }

                if (!isLoaded) return null

                return (
                  <Viewport
                    documentId={activeDocumentId}
                    className="h-full w-full !overflow-hidden"
                  >
                    <Scroller
                      documentId={activeDocumentId}
                      renderPage={({ pageIndex, width, height }) => {
                        if (pageIndex !== 0) return null

                        return (
                          <div
                            className="mx-auto"
                            style={{ width, height }}
                          >
                            <RenderLayer
                              documentId={activeDocumentId}
                              pageIndex={0}
                            />
                          </div>
                        )
                      }}
                    />
                  </Viewport>
                )
              }}
            </DocumentContent>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Laddar…
            </div>
          )
        }
      </EmbedPDF>
    </div>
  )
}
