import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { useAction, useMutation, useQuery } from "convex/react"
import { ChevronDown, CopyPlus, FileText } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import type {
  ChatInputHandle,
  ChatInputSubmitPayload,
} from "~/components/rooms/chat-input"
import type { ProblemHelpStartDraft } from "~/components/rooms/problem-help-actions"
import type { RoomSidebarSection } from "~/components/rooms/room-sidebar"
import { ParsedProblemView } from "~/components/lumo/parsed-problem"
import { ChatInput } from "~/components/rooms/chat-input"
import { FilesGrid } from "~/components/rooms/files-panel"
import { PdfViewerSheet } from "~/components/rooms/pdf-viewer-sheet"
import { ProblemHelpActions } from "~/components/rooms/problem-help-actions"
import {
  PROBLEM_CHAT_DELETION_EXPIRY,
  formatSidebarTimeLeft,
} from "~/lib/chat-deletion-expiry"
import { DEFAULT_CHAT_MODE } from "~/lib/chat-mode"
import { formatProblemMentionToken } from "~/lib/chat-composer"
import { chaptersFromMarkdown } from "~/lib/markdown-math"
import { RoomSidebar } from "~/components/rooms/room-sidebar"
import {
  RoomSettingsPanel,
  type RoomSettingsFocusSection,
} from "~/components/rooms/room-settings-panel"
import { DraftThreadChat, ThreadChat } from "~/components/rooms/thread-chat"
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { ScrollArea } from "~/components/ui/scroll-area"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "~/components/ui/sidebar"
import { Skeleton } from "~/components/ui/skeleton"
import { TooltipProvider } from "~/components/ui/tooltip"
import { uploadFileToStorage } from "~/lib/upload"
import { useUiStore } from "~/stores/ui-store"

export const Route = createFileRoute("/dashboard/rooms/$roomId")({
  component: RoomPage,
})

function RoomPage() {
  const { roomId } = Route.useParams()
  const typedRoomId = roomId as Id<"rooms">
  const navigate = useNavigate()

  const room = useQuery(api.rooms.get, { roomId: typedRoomId })
  const threads = useQuery(api.threads.listByRoom, { roomId: typedRoomId })
  const problemGroups = useQuery(api.PDFParse.problems.listGroupedByRoom, {
    roomId: typedRoomId,
  })

  const createThread = useMutation(api.threads.create)
  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const sendMessage = useMutation(api.threads.sendMessage)
  const createShadow = useAction(api.PDFParse.shadowProblems.createShadow)
  const setProblemStars = useMutation(api.PDFParse.problems.setStars)
  const setProblemCompleted = useMutation(api.PDFParse.problems.setCompleted)
  const setProblemOccasion = useMutation(api.roomOccasions.setForProblem)
  const cloneTemplate = useMutation(api.roomTemplates.clone)
  const removeRoom = useMutation(api.rooms.remove)

  const [section, setSection] = useState<RoomSidebarSection>("problems")
  const [settingsFocus, setSettingsFocus] =
    useState<RoomSettingsFocusSection | null>(null)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [selectedProblemId, setSelectedProblemId] =
    useState<Id<"problems"> | null>(null)
  const [isDraftChat, setIsDraftChat] = useState(false)
  const [draftChatKey, setDraftChatKey] = useState(0)
  const [creatingShadow, setCreatingShadow] = useState(false)
  const [shadowError, setShadowError] = useState<string | null>(null)
  const [viewingPdf, setViewingPdf] = useState<{
    name: string
    url: string
    /** 1-based EmbedPDF page; omit to open at the start. */
    pageNumber?: number
  } | null>(null)
  const [bannerPending, setBannerPending] = useState(false)
  const [bannerError, setBannerError] = useState<string | null>(null)
  const [composerFocusSignal, setComposerFocusSignal] = useState(0)
  const [problemChatPending, setProblemChatPending] = useState(false)
  const [problemChatError, setProblemChatError] = useState<string | null>(null)
  const problemChatInputRef = useRef<ChatInputHandle>(null)
  const showFacit = useUiStore((s) => s.showFacit)
  const setShowFacit = useUiStore((s) => s.setShowFacit)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    setShadowError(null)
  }, [selectedProblemId])

  const hasTimedChats = useMemo(
    () => (threads ?? []).some((thread) => thread.deleteAt != null),
    [threads],
  )

  useEffect(() => {
    if (!hasTimedChats) return
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [hasTimedChats])

  const selectedThread = useQuery(
    api.threads.get,
    selectedThreadId && section === "chats"
      ? { roomId: typedRoomId, threadId: selectedThreadId }
      : "skip",
  )

  const selectedProblem = useQuery(
    api.PDFParse.problems.getForRoom,
    selectedProblemId && section === "problems"
      ? { roomId: typedRoomId, problemId: selectedProblemId }
      : "skip",
  )
  const roomOccasions = useQuery(api.roomOccasions.listByRoom, {
    roomId: typedRoomId,
  })
  const selectedProblemOccasionEntries = useQuery(
    api.roomOccasions.listEntriesForProblem,
    selectedProblemId && section === "problems"
      ? { roomId: typedRoomId, problemId: selectedProblemId }
      : "skip",
  )

  const roomFiles = useQuery(
    api.files.listByRoom,
    section === "problems" ? { roomId: typedRoomId } : "skip",
  )

  const selectedProblemFileUrl = useMemo(() => {
    if (selectedProblem == null || selectedProblem.fileId === null) {
      return null
    }
    const fromRoomFiles = roomFiles?.find(
      (file) => file._id === selectedProblem.fileId,
    )?.url
    if (typeof fromRoomFiles === "string" && fromRoomFiles.length > 0) {
      return fromRoomFiles
    }
    if (
      typeof selectedProblem.fileUrl === "string" &&
      selectedProblem.fileUrl.length > 0
    ) {
      return selectedProblem.fileUrl
    }
    return null
  }, [roomFiles, selectedProblem])

  const chatItems = useMemo(
    () =>
      (threads ?? []).map((thread) => ({
        id: thread.threadId,
        title: thread.title,
        problemNumbers: thread.mentionedProblemNumbers,
        ttlLabel:
          thread.deleteAt != null
            ? formatSidebarTimeLeft(thread.deleteAt, now)
            : undefined,
      })),
    [now, threads],
  )

  const problemGroupItems = useMemo(
    () =>
      (problemGroups?.groups ?? []).map((group) => ({
        fileId: group.fileId,
        fileName: group.fileName,
        problems: group.problems.map((problem) => ({
          id: problem.id,
          problemNumber: problem.problemNumber,
          starEntries: problem.starEntries,
          completionEntries: problem.completionEntries,
          shadows: problem.shadows.map((shadow) => ({
            id: shadow.id,
            problemNumber: shadow.problemNumber,
          })),
        })),
      })),
    [problemGroups],
  )

  const archivedProblemPdfs = useMemo(
    () =>
      (problemGroups?.archived ?? []).map((item) => ({
        fileId: item.fileId,
        fileName: item.fileName,
      })),
    [problemGroups],
  )

  // Clear selection when the open problem was archived (or otherwise left the list).
  useEffect(() => {
    if (selectedProblemId === null || problemGroups === undefined) return
    const stillVisible = problemGroupItems.some((group) =>
      group.problems.some(
        (problem) =>
          problem.id === selectedProblemId ||
          (problem.shadows ?? []).some(
            (shadow) => shadow.id === selectedProblemId,
          ),
      ),
    )
    if (!stillVisible) {
      setSelectedProblemId(null)
    }
  }, [problemGroupItems, problemGroups, selectedProblemId])

  const selectedProblemStarEntries = useMemo(() => {
    if (selectedProblemId === null) return []
    for (const group of problemGroupItems) {
      for (const problem of group.problems) {
        if (problem.id === selectedProblemId) return problem.starEntries
      }
    }
    return []
  }, [problemGroupItems, selectedProblemId])

  const selectedProblemCompletionEntries = useMemo(() => {
    if (selectedProblemId === null) return []
    for (const group of problemGroupItems) {
      for (const problem of group.problems) {
        if (problem.id === selectedProblemId) return problem.completionEntries
      }
    }
    return []
  }, [problemGroupItems, selectedProblemId])

  const occasionOptions = useMemo(
    () =>
      (roomOccasions ?? []).map((occasion) => ({
        id: occasion._id,
        label: occasion.label,
      })),
    [roomOccasions],
  )

  const subproblemLetters = useMemo(() => {
    const question = selectedProblem?.problem.question
    if (!question) return [] as Array<string>
    return chaptersFromMarkdown(question).map((chapter) => chapter.label)
  }, [selectedProblem?.problem.question])

  async function handleCreateShadow(letter: string | null = null) {
    if (
      selectedProblemId === null ||
      creatingShadow ||
      selectedProblem?.isShadow
    ) {
      return
    }
    setCreatingShadow(true)
    setShadowError(null)
    try {
      const shadowId = await createShadow({
        roomId: typedRoomId,
        parentProblemId: selectedProblemId,
        subproblemLetter: letter ?? undefined,
      })
      setSelectedProblemId(shadowId)
    } catch (err) {
      setShadowError(
        err instanceof Error ? err.message : "Kunde inte skapa tvilling",
      )
    } finally {
      setCreatingShadow(false)
    }
  }

  function openThread(threadId: string) {
    setSection("chats")
    setIsDraftChat(false)
    setSelectedThreadId(threadId)
    setSelectedProblemId(null)
  }

  function handleNewChat() {
    setSection("chats")
    setSelectedThreadId(null)
    setSelectedProblemId(null)
    setSettingsFocus(null)
    setIsDraftChat(true)
    setDraftChatKey((n) => n + 1)
    setComposerFocusSignal((n) => n + 1)
  }

  async function handleProblemChatSubmit(
    problemNumber: string,
    fileName: string,
    payload: ChatInputSubmitPayload,
  ) {
    if (problemChatPending) return

    setProblemChatError(null)
    setProblemChatPending(true)
    try {
      const result = await createThread({
        roomId: typedRoomId,
        title: `Uppgift ${problemNumber}`,
        mode: payload.mode ?? DEFAULT_CHAT_MODE,
        deletionExpiry: PROBLEM_CHAT_DELETION_EXPIRY,
        mentionedProblemNumbers: [
          formatProblemMentionToken(problemNumber, fileName),
        ],
      })

      const uploaded = await Promise.all(
        payload.images.map(async (image) => {
          const storageId = await uploadFileToStorage(image.file, () =>
            generateUploadUrl({ roomId: typedRoomId }),
          )
          return { storageId, filename: image.file.name }
        }),
      )
      const images = [
        ...(payload.storageImages ?? []),
        ...uploaded,
      ]

      const problemIds =
        payload.problemIds ??
        (payload.problemId
          ? [payload.problemId]
          : selectedProblemId
            ? [selectedProblemId]
            : undefined)

      await sendMessage({
        roomId: typedRoomId,
        threadId: result.threadId,
        prompt: payload.prompt,
        images: images.length > 0 ? images : undefined,
        problemIds,
        problemId: problemIds?.[0],
        subproblemLetter: payload.subproblemLetter,
      })

      openThread(result.threadId)
    } catch (err: unknown) {
      setProblemChatError(
        err instanceof Error ? err.message : "Kunde inte starta chatt",
      )
      throw err
    } finally {
      setProblemChatPending(false)
    }
  }

  if (room === undefined) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6">
        <Skeleton className="h-4 w-40" />
        <p className="text-sm text-muted-foreground">Hämtar rum…</p>
      </div>
    )
  }

  if (room === null) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-muted-foreground">
          Rummet hittades inte eller så saknar du åtkomst.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button render={<Link to="/dashboard" />}>Tillbaka till dashboard</Button>
          <Button variant="outline" render={<Link to="/profile" />}>
            Profil
          </Button>
        </div>
      </div>
    )
  }

  // TODO: Add a thin convex-test suite for critical authz + happy paths.
  return (
    <TooltipProvider>
      <SidebarProvider className="h-svh! min-h-0">
        <RoomSidebar
          roomName={room.name}
          roomDescription={room.description}
          section={section}
          onSectionChange={(next) => {
            setSection(next)
            if (next !== "settings") setSettingsFocus(null)
            if (next !== "chats") {
              setSelectedThreadId(null)
              setIsDraftChat(false)
            }
            if (next !== "problems") setSelectedProblemId(null)
          }}
          onBack={() => void navigate({ to: "/dashboard" })}
          onNewChat={handleNewChat}
          chats={chatItems}
          selectedChatId={section === "chats" ? selectedThreadId : null}
          onSelectChat={(threadId) => {
            setSection("chats")
            setIsDraftChat(false)
            setSelectedThreadId(threadId)
            setSelectedProblemId(null)
            setSettingsFocus(null)
          }}
          problemGroups={problemGroupItems}
          archivedProblemPdfs={archivedProblemPdfs}
          roomId={typedRoomId}
          selectedProblemId={
            section === "problems" ? selectedProblemId : null
          }
          onSelectProblem={(id) => {
            setSection("problems")
            setSelectedProblemId(id as Id<"problems">)
            setSelectedThreadId(null)
            setIsDraftChat(false)
            setProblemChatError(null)
            setShadowError(null)
            setSettingsFocus(null)
          }}
          onOpenProblemPdfOrder={() => {
            setSettingsFocus("problemPdfOrder")
            setSection("settings")
            setSelectedThreadId(null)
            setIsDraftChat(false)
            setSelectedProblemId(null)
          }}
          onOpenOccasions={() => {
            setSettingsFocus("occasions")
            setSection("settings")
            setSelectedThreadId(null)
            setIsDraftChat(false)
            setSelectedProblemId(null)
          }}
        />

        <SidebarInset className="min-h-0 overflow-hidden">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4 md:hidden">
            <SidebarTrigger />
            <span className="truncate text-sm font-medium">{room.name}</span>
          </header>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
        {room.templateExpired ? (
          <Alert className="mb-4 shrink-0 border-amber-500/40 bg-amber-500/10">
            <AlertTitle>Mallen för det här rummet är utgången</AlertTitle>
            <AlertDescription>
              <p>
                {room.replacementTemplate
                  ? `Klona den nya mallen “${room.replacementTemplate.name}” och radera det här rummet om du inte längre behöver det.`
                  : "Sök upp en ny mall under Mallar på dashboarden, klona den, och radera det här rummet om du inte längre behöver det."}
              </p>
              {bannerError ? (
                <p className="mt-2 text-destructive">{bannerError}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {room.replacementTemplate ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={bannerPending}
                    onClick={() => {
                      if (!room.replacementTemplate) return
                      const replacementId = room.replacementTemplate._id
                      setBannerError(null)
                      setBannerPending(true)
                      void cloneTemplate({ templateId: replacementId })
                        .then(async (newRoomId) => {
                          try {
                            await removeRoom({ roomId: typedRoomId })
                          } catch {
                            // New room exists; old room may remain if delete fails.
                          }
                          void navigate({
                            to: "/dashboard/rooms/$roomId",
                            params: { roomId: newRoomId },
                          })
                        })
                        .catch((err: unknown) => {
                          setBannerError(
                            err instanceof Error
                              ? err.message
                              : "Kunde inte klona ersättningsmallen",
                          )
                        })
                        .finally(() => setBannerPending(false))
                    }}
                  >
                    {bannerPending
                      ? "Klonar…"
                      : `Klona “${room.replacementTemplate.name}” och radera detta`}
                  </Button>
                ) : (
                  <Button type="button" size="sm" render={<Link to="/dashboard" />}>
                    Till mallar
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={bannerPending}
                  onClick={() => {
                    setBannerError(null)
                    setBannerPending(true)
                    void removeRoom({ roomId: typedRoomId })
                      .then(() => {
                        void navigate({ to: "/dashboard" })
                      })
                      .catch((err: unknown) => {
                        setBannerError(
                          err instanceof Error
                            ? err.message
                            : "Kunde inte radera rummet",
                        )
                      })
                      .finally(() => setBannerPending(false))
                  }}
                >
                  Radera det här rummet
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}
        {section === "files" ? (
          <ScrollArea className="min-h-0 flex-1">
            <FilesGrid roomId={typedRoomId} />
          </ScrollArea>
        ) : section === "settings" ? (
          <ScrollArea className="min-h-0 flex-1">
            <RoomSettingsPanel
              roomId={typedRoomId}
              focusSection={settingsFocus}
              onFocusHandled={() => setSettingsFocus(null)}
            />
          </ScrollArea>
        ) : section === "problems" ? (
          selectedProblemId === null ? (
            <div className="overflow-y-auto">
              <h2 className="text-lg font-medium">Uppgifter</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Välj en uppgift i listan till vänster, eller tolka en PDF under{" "}
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 font-medium"
                  onClick={() => setSection("files")}
                >
                  Filer
                </Button>
                .
              </p>
            </div>
          ) : selectedProblem === undefined ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <p className="text-sm text-muted-foreground">Hämtar uppgift…</p>
            </div>
          ) : selectedProblem === null ? (
            <p className="text-sm text-muted-foreground">
              Uppgiften hittades inte eller så saknar du åtkomst.
            </p>
          ) : (
            <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {selectedProblem.isShadow
                    ? selectedProblem.parentProblemNumber
                      ? `Tvilling till ${selectedProblem.parentProblemNumber}`
                      : "Tvilling"
                    : `Från ${selectedProblem.fileName}`}
                  {selectedProblem.isShadow && selectedProblem.fileName !== "Tvilling"
                    ? ` · ${selectedProblem.fileName}`
                    : null}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedProblem.fileId !== null ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={
                              selectedProblem.problem.flags?.some(
                                (flag) => flag.kind === "needs_pdf",
                              )
                                ? "gap-1.5 border-amber-500/40 bg-amber-500/5 text-amber-950 hover:bg-amber-500/10 dark:text-amber-100"
                                : "gap-1.5"
                            }
                            disabled={selectedProblemFileUrl === null}
                          />
                        }
                      >
                        <FileText className="size-3.5" />
                        Visa original
                        <ChevronDown
                          className="size-3.5 opacity-60"
                          aria-hidden
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-48">
                        <DropdownMenuItem
                          disabled={selectedProblemFileUrl === null}
                          onClick={() => {
                            if (selectedProblemFileUrl === null) return
                            setViewingPdf({
                              name: selectedProblem.fileName,
                              url: selectedProblemFileUrl,
                            })
                          }}
                        >
                          Öppna
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={
                            selectedProblemFileUrl === null ||
                            selectedProblem.sourceQuestionPageIdx == null
                          }
                          onClick={() => {
                            if (
                              selectedProblemFileUrl === null ||
                              selectedProblem.sourceQuestionPageIdx == null
                            ) {
                              return
                            }
                            setViewingPdf({
                              name: selectedProblem.fileName,
                              url: selectedProblemFileUrl,
                              pageNumber:
                                selectedProblem.sourceQuestionPageIdx + 1,
                            })
                          }}
                        >
                          Öppna fråga
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={
                            selectedProblemFileUrl === null ||
                            selectedProblem.sourceAnswerPageIdx == null
                          }
                          onClick={() => {
                            if (
                              selectedProblemFileUrl === null ||
                              selectedProblem.sourceAnswerPageIdx == null
                            ) {
                              return
                            }
                            setViewingPdf({
                              name: selectedProblem.fileName,
                              url: selectedProblemFileUrl,
                              pageNumber:
                                selectedProblem.sourceAnswerPageIdx + 1,
                            })
                          }}
                        >
                          Öppna svar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                  {!selectedProblem.isShadow ? (
                    subproblemLetters.length === 0 ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={creatingShadow}
                        onClick={() => void handleCreateShadow(null)}
                      >
                        <CopyPlus className="size-3.5" />
                        {creatingShadow ? "Skapar…" : "Skapa tvilling"}
                      </Button>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              disabled={creatingShadow}
                            />
                          }
                        >
                          <CopyPlus className="size-3.5" />
                          {creatingShadow ? "Skapar…" : "Skapa tvilling"}
                          <ChevronDown
                            className="size-3.5 opacity-60"
                            aria-hidden
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-48">
                          <DropdownMenuItem
                            onClick={() => void handleCreateShadow(null)}
                          >
                            Hela uppgiften
                          </DropdownMenuItem>
                          {subproblemLetters.map((letter) => (
                            <DropdownMenuItem
                              key={letter}
                              onClick={() => void handleCreateShadow(letter)}
                            >
                              Deluppgift ({letter})
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )
                  ) : null}
                </div>
              </div>
              {shadowError ? (
                <p className="mt-2 text-sm text-destructive" role="alert">
                  {shadowError}
                </p>
              ) : null}
              <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-3">
                <ParsedProblemView
                  problem={selectedProblem.problem}
                  showAnswer={showFacit}
                  showFacitToggle
                  onShowAnswerChange={setShowFacit}
                  subproblemLetters={
                    selectedProblem.isShadow ? [] : subproblemLetters
                  }
                  starEntries={
                    selectedProblem.isShadow
                      ? []
                      : selectedProblemStarEntries
                  }
                  onStarsChange={
                    selectedProblem.isShadow
                      ? undefined
                      : (letter, stars) => {
                          void setProblemStars({
                            roomId: typedRoomId,
                            problemId: selectedProblem.id,
                            stars,
                            subproblemLetter:
                              letter === "" ? undefined : letter,
                          })
                        }
                  }
                  completionEntries={
                    selectedProblem.isShadow
                      ? []
                      : selectedProblemCompletionEntries
                  }
                  onCompletedChange={
                    selectedProblem.isShadow
                      ? undefined
                      : (letter, completed) => {
                          void setProblemCompleted({
                            roomId: typedRoomId,
                            problemId: selectedProblem.id,
                            completed,
                            subproblemLetter:
                              letter === "" ? undefined : letter,
                          })
                        }
                  }
                  occasionOptions={
                    selectedProblem.isShadow ? [] : occasionOptions
                  }
                  occasionEntries={
                    selectedProblem.isShadow
                      ? []
                      : (selectedProblemOccasionEntries ?? [])
                  }
                  onOccasionChange={
                    selectedProblem.isShadow
                      ? undefined
                      : (letter, occasionId) => {
                          void setProblemOccasion({
                            roomId: typedRoomId,
                            problemId: selectedProblem.id,
                            occasionId:
                              occasionId === null
                                ? null
                                : (occasionId as Id<"roomOccasions">),
                            subproblemLetter:
                              letter === "" ? undefined : letter,
                          })
                        }
                  }
                />
                <div className="flex justify-center py-6">
                  <ProblemHelpActions
                    roomId={typedRoomId}
                    problemNumber={selectedProblem.problem.problemNumber}
                    fileName={selectedProblem.fileName}
                    subproblemLetters={subproblemLetters}
                    pending={problemChatPending}
                    onSelect={async (draft: ProblemHelpStartDraft) => {
                      await problemChatInputRef.current?.submitStartDraft({
                        prompt: draft.prompt,
                        mode: draft.mode,
                        storageImages: draft.images,
                        subproblemLetter: draft.subproblemLetter,
                      })
                    }}
                  />
                </div>
              </div>
              <ChatInput
                ref={problemChatInputRef}
                roomId={typedRoomId}
                problemGroups={problemGroups?.groups}
                defaultProblemId={selectedProblem.id}
                className="shrink-0"
                pending={problemChatPending}
                error={problemChatError}
                placeholder="Lägg till en anteckning… eller skicka direkt"
                onSubmit={(payload) =>
                  handleProblemChatSubmit(
                    selectedProblem.problem.problemNumber,
                    selectedProblem.fileName,
                    payload,
                  )
                }
              />
            </div>
          )
        ) : isDraftChat ? (
          <DraftThreadChat
            key={draftChatKey}
            roomId={typedRoomId}
            problemGroups={problemGroups?.groups}
            composerFocusSignal={composerFocusSignal}
            onCreated={openThread}
          />
        ) : selectedThreadId === null ? (
          <>
            <h2 className="text-lg font-medium">Chattar</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Skapa en ny chatt eller välj en i listan till vänster.
            </p>
          </>
        ) : selectedThread === undefined ? (
          <p className="text-sm text-muted-foreground">Hämtar tråd…</p>
        ) : selectedThread === null ? (
          <p className="text-sm text-muted-foreground">
            Tråden hittades inte eller så saknar du åtkomst.
          </p>
        ) : (
          <ThreadChat
            roomId={typedRoomId}
            threadId={selectedThread.threadId}
            title={selectedThread.title}
            problemGroups={problemGroups?.groups}
            mode={selectedThread.mode}
            deletionExpiry={selectedThread.deletionExpiry}
            deleteAt={selectedThread.deleteAt}
            mentionedProblemNumbers={selectedThread.mentionedProblemNumbers}
            onArchived={() => {
              setSelectedThreadId(null)
              setIsDraftChat(false)
            }}
            composerFocusSignal={composerFocusSignal}
          />
        )}
          </div>
        </SidebarInset>
      </SidebarProvider>

      <PdfViewerSheet
        open={viewingPdf !== null}
        onOpenChange={(open) => {
          if (!open) setViewingPdf(null)
        }}
        fileName={viewingPdf?.name ?? null}
        url={viewingPdf?.url ?? null}
        pageNumber={viewingPdf?.pageNumber ?? null}
      />
    </TooltipProvider>
  )
}
