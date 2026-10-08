import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "convex/react"
import { ArrowLeft } from "lucide-react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"

export const Route = createFileRoute("/rooms/$roomId")({
  component: RoomPage,
})

const TABS = [{ id: "overview", label: "Översikt" }] as const

function RoomPage() {
  const { roomId } = Route.useParams()
  const room = useQuery(api.rooms.get, {
    roomId: roomId as Id<"rooms">,
  })

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
    <div className="flex min-h-svh bg-background">
      <aside className="flex w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
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

        <nav className="flex flex-col gap-0.5 p-2" aria-label="Rummeny">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={cn(
                "rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors",
                "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex flex-1 flex-col p-6">
        <h2 className="text-lg font-medium">Översikt</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Välkommen till {room.name}.
        </p>
      </main>
    </div>
  )
}
