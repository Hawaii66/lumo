import { Link, useNavigate } from "@tanstack/react-router"
import { useQuery } from "convex/react"
import {
  ArrowLeft,
  CalendarDays,
  FileText,
  ListChecks,
  Settings2,
  Upload,
} from "lucide-react"
import { useEffect, useState } from "react"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"

type StudioTab =
  | "general"
  | "files"
  | "occasions"
  | "problems"
  | "publish"

export function TemplateStudioPage({ roomId }: { roomId: Id<"rooms"> }) {
  const navigate = useNavigate()
  const room = useQuery(api.rooms.get, { roomId })
  const [tab, setTab] = useState<StudioTab>("general")

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
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6 sm:p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <p className="text-sm text-muted-foreground">Öppnar mallstudio…</p>
      </main>
    )
  }

  if (room === null) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-6 sm:p-8">
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
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6 sm:p-8">
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

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as StudioTab)}
      >
        <TabsList
          className="grid h-auto! min-h-12 w-full grid-cols-5 bg-sidebar-accent/40"
          aria-label="Mallstudio"
        >
          <TabsTrigger
            value="general"
            className="flex h-auto! min-h-10 flex-col gap-0.5 py-1.5 text-[10px] font-medium tracking-wide uppercase data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground data-active:shadow-sm"
          >
            <Settings2 className="size-3.5" />
            Allmänt
          </TabsTrigger>
          <TabsTrigger
            value="files"
            className="flex h-auto! min-h-10 flex-col gap-0.5 py-1.5 text-[10px] font-medium tracking-wide uppercase data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground data-active:shadow-sm"
          >
            <FileText className="size-3.5" />
            PDF:er
          </TabsTrigger>
          <TabsTrigger
            value="occasions"
            className="flex h-auto! min-h-10 flex-col gap-0.5 py-1.5 text-[10px] font-medium tracking-wide uppercase data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground data-active:shadow-sm"
          >
            <CalendarDays className="size-3.5" />
            Tillfällen
          </TabsTrigger>
          <TabsTrigger
            value="problems"
            className="flex h-auto! min-h-10 flex-col gap-0.5 py-1.5 text-[10px] font-medium tracking-wide uppercase data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground data-active:shadow-sm"
          >
            <ListChecks className="size-3.5" />
            Uppgifter
          </TabsTrigger>
          <TabsTrigger
            value="publish"
            className="flex h-auto! min-h-10 flex-col gap-0.5 py-1.5 text-[10px] font-medium tracking-wide uppercase data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground data-active:shadow-sm"
          >
            <Upload className="size-3.5" />
            Publicera
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6 flex flex-col gap-6">
          <RoomDetailsCard roomId={roomId} />
          <CourseInfoCellsCard roomId={roomId} />
          <RoomDangerZoneCard roomId={roomId} />
        </TabsContent>

        <TabsContent value="files" className="mt-6 flex flex-col gap-6">
          <FilesGrid roomId={roomId} />
          <ProblemPdfOrderCard roomId={roomId} />
        </TabsContent>

        <TabsContent value="occasions" className="mt-6 flex flex-col gap-6">
          <RoomOccasionsCard roomId={roomId} />
        </TabsContent>

        <TabsContent value="problems" className="mt-6 flex flex-col gap-6">
          <RoomProblemAssignmentsCard roomId={roomId} />
        </TabsContent>

        <TabsContent value="publish" className="mt-6 flex flex-col gap-6">
          <RoomTemplatesCard roomId={roomId} />
        </TabsContent>
      </Tabs>
    </main>
  )
}
