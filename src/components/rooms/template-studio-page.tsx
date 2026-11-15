import { Link, useNavigate } from "@tanstack/react-router"
import { useQuery } from "convex/react"
import { ArrowLeft } from "lucide-react"
import { useEffect } from "react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { FilesGrid } from "~/components/rooms/files-panel"
import { CourseInfoCellsCard } from "~/components/rooms/room-settings/course-info-cells-card"
import { ProblemPdfOrderCard } from "~/components/rooms/room-settings/problem-pdf-order-card"
import { RoomDangerZoneCard } from "~/components/rooms/room-settings/room-danger-zone-card"
import { RoomDetailsCard } from "~/components/rooms/room-settings/room-details-card"
import { RoomOccasionsCard } from "~/components/rooms/room-settings/room-occasions-card"
import { RoomProblemAssignmentsCard } from "~/components/rooms/room-settings/room-problem-assignments-card"
import { RoomTemplatesCard } from "~/components/rooms/room-settings/room-templates-card"
import { Button } from "~/components/ui/button"
import { Skeleton } from "~/components/ui/skeleton"

export function TemplateStudioPage({ roomId }: { roomId: Id<"rooms"> }) {
  const navigate = useNavigate()
  const room = useQuery(api.rooms.get, { roomId })

  useEffect(() => {
    if (room == null) return
    if (!room.isTemplateRoom) {
      void navigate({
        to: "/dashboard/rooms/$roomId",
        params: { roomId },
        replace: true,
      })
    }
  }, [navigate, room, roomId])

  if (room === undefined) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 sm:p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <p className="text-sm text-muted-foreground">Öppnar mallstudio…</p>
      </main>
    )
  }

  if (room === null) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6 sm:p-8">
        <p className="text-sm text-muted-foreground">
          Mallrummet hittades inte eller så saknar du åtkomst.
        </p>
        <Button variant="outline" size="sm" render={<Link to="/dashboard" />}>
          Tillbaka till dashboard
        </Button>
      </main>
    )
  }

  if (!room.isTemplateRoom) {
    return null
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 gap-1.5 text-muted-foreground"
            render={<Link to="/dashboard" />}
          >
            <ArrowLeft className="size-3.5" />
            Dashboard
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            Mallstudio · {room.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Ladda upp PDF:er, ordna tillfällen och publicera när utkastet är
            klart. Chatt är avstängt i mallrum.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col gap-6">
          <RoomDetailsCard roomId={roomId} />
          <RoomTemplatesCard roomId={roomId} />
          <section className="space-y-3">
            <div>
              <h2 className="text-base font-medium">PDF:er</h2>
              <p className="text-sm text-muted-foreground">
                Ladda upp, tolka och ordna filerna som ingår i mallen.
              </p>
            </div>
            <FilesGrid roomId={roomId} />
            <ProblemPdfOrderCard roomId={roomId} />
          </section>
          <CourseInfoCellsCard roomId={roomId} />
          <RoomOccasionsCard roomId={roomId} />
          <RoomDangerZoneCard roomId={roomId} />
        </div>

        <div className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
          <RoomProblemAssignmentsCard roomId={roomId} />
        </div>
      </div>
    </main>
  )
}
