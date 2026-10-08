import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "convex/react"
import { ArrowLeft } from "lucide-react"
import { useState } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import {
  FilesGrid,
  RoomFilesTabBar,
} from "~/components/rooms/files-panel"
import { ThreadChat } from "~/components/rooms/thread-chat"
import { ThreadsPanel } from "~/components/rooms/threads-panel"
import { Button } from "~/components/ui/button"

export const Route = createFileRoute("/rooms/$roomId")({
  component: RoomPage,
})

type MainView = "thread" | "files"

function RoomPage() {
  const { roomId } = Route.useParams()
  const typedRoomId = roomId as Id<"rooms">
  const room = useQuery(api.rooms.get, { roomId: typedRoomId })
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [mainView, setMainView] = useState<MainView>("thread")

  const selectedThread = useQuery(
    api.threads.get,
    selectedThreadId && mainView === "thread"
      ? { roomId: typedRoomId, threadId: selectedThreadId }
      : "skip",
  )

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
      <aside className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="border-b border-sidebar-border p-3">
          <Button
            variant="ghost"
            size="sm"
            className="mb-3 w-full justify-start gap-1.5"
            render={<Link to="/" />}
          >
            <ArrowLeft />
            Tillbaka
          </Button>
          <h1 className="truncate text-base font-medium leading-snug">
            {room.name}
          </h1>
          <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
            {room.description}
          </p>
        </div>

        <div className="px-3 pt-3">
          <h2 className="px-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Trådar
          </h2>
        </div>

        <ThreadsPanel
          roomId={typedRoomId}
          selectedThreadId={mainView === "thread" ? selectedThreadId : null}
          onSelectThread={(threadId) => {
            setSelectedThreadId(threadId)
            setMainView("thread")
          }}
        />

        <RoomFilesTabBar
          filesActive={mainView === "files"}
          onShowFiles={() => setMainView("files")}
        />
      </aside>

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
        {mainView === "files" ? (
          <FilesGrid roomId={typedRoomId} />
        ) : selectedThreadId === null ? (
          <>
            <h2 className="text-lg font-medium">Trådar</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Skapa en ny tråd eller välj en i listan till vänster.
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
