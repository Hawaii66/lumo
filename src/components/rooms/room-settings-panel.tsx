import { useQuery } from "convex/react"
import { Archive, Settings2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { api } from "../../../convex/_generated/api"
import type { LucideIcon } from "lucide-react"
import type { Id } from "../../../convex/_generated/dataModel"
import { cn } from "~/lib/utils"
import { ArchivedThreadsCard } from "./room-settings/archived-threads-card"
import { CourseInfoCellsCard } from "./room-settings/course-info-cells-card"
import { ProblemPdfOrderCard } from "./room-settings/problem-pdf-order-card"
import { RoomDangerZoneCard } from "./room-settings/room-danger-zone-card"
import { RoomDetailsCard } from "./room-settings/room-details-card"
import { RoomMembersCard } from "./room-settings/room-members-card"
import { RoomTemplatesCard } from "./room-settings/room-templates-card"

type SettingsTab = "general" | "archived"

const SETTINGS_TABS: Array<{
  id: SettingsTab
  label: string
  icon: LucideIcon
}> = [
  { id: "general", label: "Allmänt", icon: Settings2 },
  { id: "archived", label: "Arkiverade", icon: Archive },
]

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
      <p className="text-sm text-muted-foreground">Hämtar inställningar…</p>
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

      <div
        role="tablist"
        aria-label="Inställningar"
        className="grid grid-cols-2 gap-0.5 rounded-lg bg-muted/60 p-0.5"
      >
        {SETTINGS_TABS.map((item) => {
          const Icon = item.icon
          const selected = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-md px-1 py-2 text-[10px] font-medium tracking-wide uppercase transition-colors",
                selected
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setTab(item.id)}
            >
              <Icon className="size-3.5" />
              {item.label}
            </button>
          )
        })}
      </div>

      {tab === "general" ? (
        <>
          <RoomDetailsCard roomId={roomId} />
          <CourseInfoCellsCard roomId={roomId} />
          <div ref={problemPdfOrderRef}>
            <ProblemPdfOrderCard roomId={roomId} />
          </div>
          <RoomTemplatesCard roomId={roomId} />
          <RoomMembersCard roomId={roomId} />
          <RoomDangerZoneCard roomId={roomId} />
        </>
      ) : (
        <ArchivedThreadsCard roomId={roomId} />
      )}
    </div>
  )
}
