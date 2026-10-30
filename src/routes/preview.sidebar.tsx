import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import {
  RoomSidebar,
  type RoomSidebarSection,
} from "~/components/rooms/room-sidebar"
import { Button } from "~/components/ui/button"

export const Route = createFileRoute("/preview/sidebar")({
  component: SidebarPreviewPage,
})

const MOCK_CHATS = [
  {
    id: "c1",
    title: "Hjälp med partialbråk",
    problemNumbers: ["1.3-tenta_2023-03"],
    ttlLabel: "2h kvar",
  },
  {
    id: "c2",
    title: "Varför blir derivatan noll?",
    problemNumbers: ["2.1a-tenta_2023-03", "2.2-tenta_2023-03"],
    ttlLabel: "45m kvar",
  },
  {
    id: "c3",
    title: "Allmän fråga om kursen",
    ttlLabel: undefined,
  },
  {
    id: "c4",
    title: "Integral med substitution",
    problemNumbers: ["3.4-ovning_vecka4"],
    ttlLabel: "22h kvar",
  },
]

const MOCK_PROBLEM_GROUPS = [
  {
    fileName: "tenta_2023-03.pdf",
    problems: [
      {
        id: "p1",
        problemNumber: "1.3",
        shadows: [
          { id: "p1t1", problemNumber: "1.3·T1" },
          { id: "p1t2", problemNumber: "1.3·T2" },
        ],
      },
      { id: "p2", problemNumber: "2.1" },
      { id: "p3", problemNumber: "2.2" },
    ],
  },
  {
    fileName: "ovning_vecka4.pdf",
    problems: [
      { id: "p4", problemNumber: "3.4" },
      { id: "p5", problemNumber: "3.5" },
    ],
  },
]

const SECTION_LABELS: Record<RoomSidebarSection, string> = {
  chats: "Chattar",
  problems: "Uppgifter",
  files: "Filer",
  settings: "Inställningar",
}

function SidebarPreviewPage() {
  const [section, setSection] = useState<RoomSidebarSection>("chats")
  const [selectedChatId, setSelectedChatId] = useState<string | null>("c1")
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(
    null,
  )
  const [lastAction, setLastAction] = useState(
    "Valde chatt: Hjälp med partialbråk",
  )

  function handleSectionChange(next: RoomSidebarSection) {
    setSection(next)
    setLastAction(`Bytte till ${SECTION_LABELS[next]}`)
  }

  return (
    <div className="flex h-svh bg-background">
      <RoomSidebar
        roomName="Flervariabelanalys SF1626"
        roomDescription="Kursrum för övningar, tentor och sokratisk hjälp. Mock-data — inget är kopplat."
        section={section}
        onSectionChange={handleSectionChange}
        onBack={() => setLastAction("Tillbaka (mock)")}
        onNewChat={() => {
          setSection("chats")
          setSelectedChatId(null)
          setSelectedProblemId(null)
          setLastAction("Öppnade Ny chatt (staging — mock)")
        }}
        chats={MOCK_CHATS}
        selectedChatId={section === "chats" ? selectedChatId : null}
        onSelectChat={(id) => {
          setSection("chats")
          setSelectedChatId(id)
          setSelectedProblemId(null)
          const chat = MOCK_CHATS.find((c) => c.id === id)
          setLastAction(`Valde chatt: ${chat?.title ?? id}`)
        }}
        problemGroups={MOCK_PROBLEM_GROUPS}
        selectedProblemId={section === "problems" ? selectedProblemId : null}
        onSelectProblem={(id) => {
          setSection("problems")
          setSelectedProblemId(id)
          setSelectedChatId(null)
          const problem = MOCK_PROBLEM_GROUPS.flatMap((g) =>
            g.problems.flatMap((p) => [p, ...(p.shadows ?? [])]),
          ).find((p) => p.id === id)
          setLastAction(`Valde uppgift ${problem?.problemNumber ?? id}`)
        }}
      />

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Preview
            </p>
            <h2 className="text-lg font-medium">Room sidebar</h2>
            <p className="mt-1 max-w-lg text-sm text-muted-foreground">
              Interaktiv mock av Chattar / Uppgifter + Filer längst ner. Ingen
              Convex-data.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" render={<Link to="/preview" />}>
              Problem preview
            </Button>
            <Button variant="outline" size="sm" render={<Link to="/" />}>
              Startsida
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Senaste åtgärd
          </p>
          <p className="mt-1 font-medium">{lastAction}</p>
        </div>

        <div className="mt-6 space-y-2 text-sm text-muted-foreground">
          <p>
            Aktiv sektion:{" "}
            <span className="font-medium text-foreground">
              {SECTION_LABELS[section]}
            </span>
          </p>
          {section === "files" ? (
            <p>
              Filer öppnar huvudytan (FilesGrid i riktiga rummet). Listan i
              sidopanelen behåller Chattar/Uppgifter.
            </p>
          ) : null}
        </div>
      </main>
    </div>
  )
}
