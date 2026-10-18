import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery } from "convex/react"
import { useMemo, useState } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { ParsedProblemView } from "~/components/lumo/parsed-problem"
import { FilesGrid } from "~/components/rooms/files-panel"
import {
  RoomSidebar,
  type RoomSidebarSection,
} from "~/components/rooms/room-sidebar"
import { ThreadChat } from "~/components/rooms/thread-chat"
import { Button } from "~/components/ui/button"

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

  const [section, setSection] = useState<RoomSidebarSection>("chats")
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [selectedProblemId, setSelectedProblemId] =
    useState<Id<"problems"> | null>(null)
  const [creatingChat, setCreatingChat] = useState(false)

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

  async function handleNewChat(title?: string) {
    if (creatingChat) return
    setCreatingChat(true)
    try {
      const result = await createThread({
        roomId: typedRoomId,
        title,
      })
      setSection("chats")
      setSelectedThreadId(result.threadId)
      setSelectedProblemId(null)
    } finally {
      setCreatingChat(false)
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
        }}
      />

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
        {section === "files" ? (
          <FilesGrid roomId={typedRoomId} />
        ) : section === "problems" ? (
          selectedProblemId === null ? (
            <>
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
            </>
          ) : selectedProblem === undefined ? (
            <p className="text-sm text-muted-foreground">Hämtar uppgift…</p>
          ) : selectedProblem === null ? (
            <p className="text-sm text-muted-foreground">
              Uppgiften hittades inte eller så saknar du åtkomst.
            </p>
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Från {selectedProblem.fileName}
                </p>
                <Button
                  size="sm"
                  disabled={creatingChat}
                  onClick={() =>
                    void handleNewChat(
                      `Uppgift ${selectedProblem.problem.problemNumber}`,
                    )
                  }
                >
                  {creatingChat ? "Skapar…" : "Starta chatt"}
                </Button>
              </div>
              <ParsedProblemView
                problem={selectedProblem.problem}
                showAnswer={false}
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
