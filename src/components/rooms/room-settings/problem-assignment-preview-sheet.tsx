import { useQuery } from "convex/react"
import { PDFViewer, type PluginRegistry } from "@embedpdf/react-pdf-viewer"
import { useEffect, useMemo, useRef, useState } from "react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { ParsedProblemView } from "~/components/lumo/parsed-problem"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { chaptersFromMarkdown } from "~/lib/markdown-math"

export type ProblemPreviewTab = "parsed" | "pdf"

type ProblemAssignmentPreviewSheetProps = {
  roomId: Id<"rooms">
  problemId: Id<"problems"> | null
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTab?: ProblemPreviewTab
}

function PdfPane({
  url,
  pageNumber,
}: {
  url: string
  pageNumber: number | null
}) {
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

    if (pageNumber == null || pageNumber < 1) return

    const scrollPlugin = registry.getPlugin("scroll")
    const scroll = scrollPlugin?.provides?.()
    if (scroll == null) return

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

  if (!mounted) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
        Laddar visare…
      </div>
    )
  }

  return (
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
          "history",
          "document",
          "panel-comment",
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
  )
}

export function ProblemAssignmentPreviewSheet({
  roomId,
  problemId,
  open,
  onOpenChange,
  initialTab = "parsed",
}: ProblemAssignmentPreviewSheetProps) {
  const [tab, setTab] = useState<ProblemPreviewTab>(initialTab)
  const [showFacit, setShowFacit] = useState(false)

  const problem = useQuery(
    api.PDFParse.problems.getForRoom,
    open && problemId !== null ? { roomId, problemId } : "skip",
  )

  useEffect(() => {
    if (!open) return
    setTab(initialTab)
    setShowFacit(false)
  }, [open, initialTab, problemId])

  const subproblemLetters = useMemo(() => {
    const question = problem?.problem.question
    if (!question) return [] as Array<string>
    return chaptersFromMarkdown(question).map((chapter) => chapter.label)
  }, [problem?.problem.question])

  const pdfPageNumber =
    problem?.sourceQuestionPageIdx != null
      ? problem.sourceQuestionPageIdx + 1
      : null

  const title =
    problem !== undefined && problem !== null
      ? `Uppgift ${problem.problem.problemNumber}`
      : "Uppgift"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 !max-w-none sm:max-w-2xl"
      >
        <SheetHeader className="border-b border-border pr-12">
          <SheetTitle className="truncate" title={title}>
            {title}
          </SheetTitle>
          <SheetDescription>
            {problem?.fileName ?? "Förhandsvisning"}
          </SheetDescription>
        </SheetHeader>

        <Tabs
          value={tab}
          onValueChange={(value) => {
            if (value === "parsed" || value === "pdf") setTab(value)
          }}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <div className="border-b border-border px-4 py-2">
            <TabsList>
              <TabsTrigger value="parsed">Tolkad</TabsTrigger>
              <TabsTrigger value="pdf">PDF</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="parsed"
            className="min-h-0 flex-1 overflow-y-auto p-4"
          >
            {problem === undefined ? (
              <p className="text-sm text-muted-foreground">Hämtar…</p>
            ) : problem === null ? (
              <p className="text-sm text-muted-foreground">
                Uppgiften hittades inte.
              </p>
            ) : (
              <ParsedProblemView
                problem={problem.problem}
                showAnswer={showFacit}
                showFacitToggle
                onShowAnswerChange={setShowFacit}
                subproblemLetters={
                  problem.isShadow ? [] : subproblemLetters
                }
              />
            )}
          </TabsContent>

          <TabsContent
            value="pdf"
            className="min-h-0 flex-1 overflow-hidden"
          >
            {problem === undefined ? (
              <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
                Hämtar…
              </div>
            ) : problem === null || problem.fileUrl === null ? (
              <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
                PDF saknas för den här uppgiften.
              </div>
            ) : (
              <PdfPane url={problem.fileUrl} pageNumber={pdfPageNumber} />
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
