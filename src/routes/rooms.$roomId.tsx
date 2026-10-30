import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { useAction, useMutation, useQuery } from "convex/react"
import { ChevronDown, CopyPlus } from "lucide-react"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import type {ChatInputHandle, ChatInputSubmitPayload} from "~/components/rooms/chat-input";
import type {ProblemHelpStartDraft} from "~/components/rooms/problem-help-actions";
import type {RoomSidebarSection} from "~/components/rooms/room-sidebar";
import { ParsedProblemView } from "~/components/lumo/parsed-problem"
import {
  ChatInput
  
  
} from "~/components/rooms/chat-input"
import { FilesGrid } from "~/components/rooms/files-panel"
import {
  ProblemHelpActions
  
} from "~/components/rooms/problem-help-actions"
import {
  PROBLEM_CHAT_DELETION_EXPIRY,
  formatSidebarTimeLeft,
} from "~/lib/chat-deletion-expiry"
import { DEFAULT_CHAT_MODE } from "~/lib/chat-mode"
import { formatProblemMentionToken } from "~/lib/chat-composer"
import { chaptersFromMarkdown } from "~/lib/markdown-math"
import {
  RoomSidebar
  
} from "~/components/rooms/room-sidebar"
import { RoomSettingsPanel } from "~/components/rooms/room-settings-panel"
import { ThreadChat } from "~/components/rooms/thread-chat"
import { Button } from "~/components/ui/button"
import { uploadFileToStorage } from "~/lib/upload"
import { cn } from "~/lib/utils"
import { useUiStore } from "~/stores/ui-store"

export const Route = createFileRoute("/rooms/$roomId")({
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
  const cloneTemplate = useMutation(api.roomTemplates.clone)
  const removeRoom = useMutation(api.rooms.remove)

  const [section, setSection] = useState<RoomSidebarSection>("chats")
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [selectedProblemId, setSelectedProblemId] =
    useState<Id<"problems"> | null>(null)
  const [creatingChat, setCreatingChat] = useState(false)
  const [creatingShadow, setCreatingShadow] = useState(false)
  const [shadowError, setShadowError] = useState<string | null>(null)
  const [twinMenuOpen, setTwinMenuOpen] = useState(false)
  const [bannerPending, setBannerPending] = useState(false)
  const [bannerError, setBannerError] = useState<string | null>(null)
  const [composerFocusSignal, setComposerFocusSignal] = useState(0)
  const [problemChatPending, setProblemChatPending] = useState(false)
  const [problemChatError, setProblemChatError] = useState<string | null>(null)
  const problemChatInputRef = useRef<ChatInputHandle>(null)
  const twinMenuRef = useRef<HTMLDivElement>(null)
  const twinMenuListId = useId()
  const showFacit = useUiStore((s) => s.showFacit)
  const setShowFacit = useUiStore((s) => s.setShowFacit)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    setShadowError(null)
    setTwinMenuOpen(false)
  }, [selectedProblemId])

  useEffect(() => {
    if (!twinMenuOpen) return

    function handlePointerDown(event: MouseEvent) {
      if (!twinMenuRef.current?.contains(event.target as Node)) {
        setTwinMenuOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setTwinMenuOpen(false)
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [twinMenuOpen])

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
      (problemGroups ?? []).map((group) => ({
        fileName: group.fileName,
        problems: group.problems.map((problem) => ({
          id: problem.id,
          problemNumber: problem.problemNumber,
          shadows: problem.shadows.map((shadow) => ({
            id: shadow.id,
            problemNumber: shadow.problemNumber,
          })),
        })),
      })),
    [problemGroups],
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
    setTwinMenuOpen(false)
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

  function handleTwinButtonClick() {
    if (creatingShadow || selectedProblem?.isShadow) return
    if (subproblemLetters.length === 0) {
      void handleCreateShadow(null)
      return
    }
    setTwinMenuOpen((open) => !open)
  }

  function openThread(threadId: string) {
    setSection("chats")
    setSelectedThreadId(threadId)
    setSelectedProblemId(null)
  }

  async function handleNewChat(title?: string) {
    if (creatingChat) return
    setCreatingChat(true)
    try {
      const result = await createThread({
        roomId: typedRoomId,
        title,
      })
      openThread(result.threadId)
      setComposerFocusSignal((n) => n + 1)
    } finally {
      setCreatingChat(false)
    }
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
      <div className="flex min-h-svh items-center justify-center p-6 text-sm text-muted-foreground">
        Hämtar rum…
      </div>
    )
  }

  if (room === null) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-muted-foreground">
          Rummet hittades inte eller så saknar du åtkomst.
        </p>
        <Button render={<Link to="/" />}>Tillbaka till startsidan</Button>
      </div>
    )
  }

  return (
    <div className="flex h-svh bg-background">
      <RoomSidebar
        roomName={room.name}
        roomDescription={room.description}
        section={section}
        onSectionChange={(next) => {
          setSection(next)
          if (next !== "chats") setSelectedThreadId(null)
          if (next !== "problems") setSelectedProblemId(null)
        }}
        onBack={() => void navigate({ to: "/" })}
        onNewChat={() => void handleNewChat()}
        chats={chatItems}
        selectedChatId={section === "chats" ? selectedThreadId : null}
        onSelectChat={(threadId) => {
          setSection("chats")
          setSelectedThreadId(threadId)
          setSelectedProblemId(null)
        }}
        problemGroups={problemGroupItems}
        selectedProblemId={
          section === "problems" ? selectedProblemId : null
        }
        onSelectProblem={(id) => {
          setSection("problems")
          setSelectedProblemId(id as Id<"problems">)
          setSelectedThreadId(null)
          setProblemChatError(null)
          setShadowError(null)
        }}
      />

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
        {room.templateExpired ? (
          <div
            className="mb-4 shrink-0 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3"
            role="status"
          >
            <p className="text-sm font-medium">Mallen för det här rummet är utgången</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {room.replacementTemplate
                ? `Klona den nya mallen “${room.replacementTemplate.name}” och radera det här rummet om du inte längre behöver det.`
                : "Sök upp en ny mall på startsidan under Mallar, klona den, och radera det här rummet om du inte längre behöver det."}
            </p>
            {bannerError ? (
              <p className="mt-2 text-sm text-destructive">{bannerError}</p>
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
                          to: "/rooms/$roomId",
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
                <Button
                  type="button"
                  size="sm"
                  render={<Link to="/" />}
                >
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
                      void navigate({ to: "/" })
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
          </div>
        ) : null}
        {section === "files" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <FilesGrid roomId={typedRoomId} />
          </div>
        ) : section === "settings" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <RoomSettingsPanel roomId={typedRoomId} />
          </div>
        ) : section === "problems" ? (
          selectedProblemId === null ? (
            <div className="overflow-y-auto">
              <h2 className="text-lg font-medium">Uppgifter</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Välj en uppgift i listan till vänster, eller tolka en PDF under{" "}
                <button
                  type="button"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                  onClick={() => setSection("files")}
                >
                  Filer
                </button>
                .
              </p>
            </div>
          ) : selectedProblem === undefined ? (
            <p className="text-sm text-muted-foreground">Hämtar uppgift…</p>
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
                {!selectedProblem.isShadow ? (
                  <div ref={twinMenuRef} className="relative">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={creatingShadow}
                      aria-haspopup={
                        subproblemLetters.length > 0 ? "listbox" : undefined
                      }
                      aria-expanded={
                        subproblemLetters.length > 0 ? twinMenuOpen : undefined
                      }
                      aria-controls={
                        twinMenuOpen ? twinMenuListId : undefined
                      }
                      onClick={handleTwinButtonClick}
                    >
                      <CopyPlus className="size-3.5" />
                      {creatingShadow ? "Skapar…" : "Skapa tvilling"}
                      {subproblemLetters.length > 0 ? (
                        <ChevronDown
                          className="size-3.5 opacity-60"
                          aria-hidden
                        />
                      ) : null}
                    </Button>

                    {twinMenuOpen && subproblemLetters.length > 0 ? (
                      <ul
                        id={twinMenuListId}
                        role="listbox"
                        aria-label="Välj omfång för tvilling"
                        className="absolute right-0 z-20 mt-1 min-w-[12rem] overflow-hidden rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-md"
                      >
                        <li role="option">
                          <button
                            type="button"
                            className={cn(
                              "flex w-full whitespace-nowrap px-3 py-1.5 text-left text-xs font-medium",
                              "hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                            )}
                            onClick={() => void handleCreateShadow(null)}
                          >
                            Hela uppgiften
                          </button>
                        </li>
                        {subproblemLetters.map((letter) => (
                          <li key={letter} role="option">
                            <button
                              type="button"
                              className={cn(
                                "flex w-full whitespace-nowrap px-3 py-1.5 text-left text-xs font-medium",
                                "hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                              )}
                              onClick={() => void handleCreateShadow(letter)}
                            >
                              Deluppgift ({letter})
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {shadowError ? (
                <p className="mt-2 text-sm text-destructive" role="alert">
                  {shadowError}
                </p>
              ) : null}
              <div className="mt-4 min-h-0 overflow-y-auto">
                <ParsedProblemView
                  problem={selectedProblem.problem}
                  showAnswer={showFacit}
                  showFacitToggle
                  onShowAnswerChange={setShowFacit}
                />
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center py-6">
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
              <ChatInput
                ref={problemChatInputRef}
                roomId={typedRoomId}
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
            mode={selectedThread.mode}
            deletionExpiry={selectedThread.deletionExpiry}
            deleteAt={selectedThread.deleteAt}
            mentionedProblemNumbers={selectedThread.mentionedProblemNumbers}
            onArchived={() => setSelectedThreadId(null)}
            composerFocusSignal={composerFocusSignal}
          />
        )}
      </main>
    </div>
  )
}
