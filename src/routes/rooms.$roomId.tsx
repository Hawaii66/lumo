import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery } from "convex/react"
import { useMemo, useState } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { ParsedProblemView } from "~/components/lumo/parsed-problem"
import {
  ChatInput,
  type ChatInputSubmitPayload,
} from "~/components/rooms/chat-input"
import { FilesGrid } from "~/components/rooms/files-panel"
import { ProblemHelpActions } from "~/components/rooms/problem-help-actions"
import {
  RoomSidebar,
  type RoomSidebarSection,
} from "~/components/rooms/room-sidebar"
import { ThreadChat } from "~/components/rooms/thread-chat"
import { Button } from "~/components/ui/button"
import { uploadFileToStorage } from "~/lib/upload"
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

  const [section, setSection] = useState<RoomSidebarSection>("chats")
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [selectedProblemId, setSelectedProblemId] =
    useState<Id<"problems"> | null>(null)
  const [creatingChat, setCreatingChat] = useState(false)
  const [problemChatPending, setProblemChatPending] = useState(false)
  const [problemChatError, setProblemChatError] = useState<string | null>(null)
  const showFacit = useUiStore((s) => s.showFacit)
  const setShowFacit = useUiStore((s) => s.setShowFacit)

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
      })),
    [threads],
  )

  const problemGroupItems = useMemo(
    () =>
      (problemGroups ?? []).map((group) => ({
        fileName: group.fileName,
        problems: group.problems.map((problem) => ({
          id: problem.id,
          problemNumber: problem.problemNumber,
        })),
      })),
    [problemGroups],
  )

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
    } finally {
      setCreatingChat(false)
    }
  }

  async function handleProblemChatSubmit(
    problemNumber: string,
    payload: ChatInputSubmitPayload,
  ) {
    if (problemChatPending) return

    setProblemChatError(null)
    setProblemChatPending(true)
    try {
      const result = await createThread({
        roomId: typedRoomId,
        title: `Uppgift ${problemNumber}`,
      })

      const uploaded = await Promise.all(
        payload.images.map(async (image) => {
          const storageId = await uploadFileToStorage(image.file, () =>
            generateUploadUrl({ roomId: typedRoomId }),
          )
          return { storageId, filename: image.file.name }
        }),
      )

      await sendMessage({
        roomId: typedRoomId,
        threadId: result.threadId,
        prompt: payload.prompt,
        images: uploaded.length > 0 ? uploaded : undefined,
        helpLevel: payload.helpLevel,
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
        }}
      />

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
        {section === "files" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <FilesGrid roomId={typedRoomId} />
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
              <p className="shrink-0 text-sm text-muted-foreground">
                Från {selectedProblem.fileName}
              </p>
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
                  onStarted={openThread}
                />
              </div>
              <ChatInput
                className="shrink-0"
                showHelpLevels={false}
                pending={problemChatPending}
                error={problemChatError}
                placeholder="Fråga om uppgiften…"
                onSubmit={(payload) =>
                  handleProblemChatSubmit(
                    selectedProblem.problem.problemNumber,
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
          />
        )}
      </main>
    </div>
  )
}
