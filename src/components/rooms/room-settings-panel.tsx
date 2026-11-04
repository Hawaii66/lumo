import { useQuery } from "convex/react"
import { Archive, Settings2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Skeleton } from "~/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { ArchivedThreadsCard } from "./room-settings/archived-threads-card"
import { CourseInfoCellsCard } from "./room-settings/course-info-cells-card"
import { ProblemPdfOrderCard } from "./room-settings/problem-pdf-order-card"
import { RoomDangerZoneCard } from "./room-settings/room-danger-zone-card"
import { RoomDetailsCard } from "./room-settings/room-details-card"
import { RoomMembersCard } from "./room-settings/room-members-card"
import { RoomTemplatesCard } from "./room-settings/room-templates-card"

type SettingsTab = "general" | "archived"

export type RoomSettingsFocusSection = "problemPdfOrder"

type RoomSettingsPanelProps = {
  roomId: Id<"rooms">
  /** Scroll/highlight a specific card when opening settings from elsewhere. */
  focusSection?: RoomSettingsFocusSection | null
  onFocusHandled?: () => void
}

export function RoomSettingsPanel({
  roomId,
  focusSection = null,
  onFocusHandled,
}: RoomSettingsPanelProps) {
  const room = useQuery(api.rooms.get, { roomId })
  const problemPdfOrderRef = useRef<HTMLDivElement>(null)

  const [tab, setTab] = useState<SettingsTab>("general")

  useEffect(() => {
    if (focusSection !== "problemPdfOrder") return
    // Wait until room data is ready so the target card is mounted.
    if (room == null) return
    setTab("general")
    const frame = requestAnimationFrame(() => {
      problemPdfOrderRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
      onFocusHandled?.()
    })
    return () => cancelAnimationFrame(frame)
  }, [focusSection, onFocusHandled, room])

  if (room === undefined) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-48" />
        <p className="text-sm text-muted-foreground">Hämtar inställningar…</p>
      </div>
    )
  }

  if (room === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Rummet hittades inte eller så saknar du åtkomst.
      </p>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h2 className="text-lg font-medium">Inställningar</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Rummets detaljer, medlemmar och arkiverade chattar.
        </p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as SettingsTab)}
      >
        <TabsList
          className="grid h-auto! w-full grid-cols-2"
          aria-label="Inställningar"
        >
          <TabsTrigger
            value="general"
            className="flex h-auto! flex-col gap-0.5 py-2 text-[10px] font-medium tracking-wide uppercase"
          >
            <Settings2 className="size-3.5" />
            Allmänt
          </TabsTrigger>
          <TabsTrigger
            value="archived"
            className="flex h-auto! flex-col gap-0.5 py-2 text-[10px] font-medium tracking-wide uppercase"
          >
            <Archive className="size-3.5" />
            Arkiverade
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6 flex flex-col gap-6">
          <RoomDetailsCard roomId={roomId} />
          <CourseInfoCellsCard roomId={roomId} />
          <div ref={problemPdfOrderRef}>
            <ProblemPdfOrderCard roomId={roomId} />
          </div>
          <RoomTemplatesCard roomId={roomId} />
          <RoomMembersCard roomId={roomId} />
          <RoomDangerZoneCard roomId={roomId} />
        </TabsContent>

        <TabsContent value="archived" className="mt-6">
          <ArchivedThreadsCard roomId={roomId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
