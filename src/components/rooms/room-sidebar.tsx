import {
  ArrowLeft,
  ChevronDown,
  Clock,
  FileText,
  FolderOpen,
  MessageSquare,
  MessageSquarePlus,
  Pin,
  Search,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { cn } from "~/lib/utils"

export type RoomSidebarListSection = "chats" | "problems"
export type RoomSidebarSection = RoomSidebarListSection | "files"

export type RoomSidebarChatItem = {
  id: string
  title: string
  /** Remaining time label, e.g. "2h kvar". Omit when kept forever. */
  ttlLabel?: string
  /** @-mentioned problem numbers shown as badges */
  problemNumbers?: string[]
}

export type RoomSidebarProblemGroup = {
  fileName: string
  problems: Array<{
    id: string
    problemNumber: string
  }>
}

export type RoomSidebarProps = {
  roomName: string
  roomDescription: string
  /** Main pane view: chats, problems, or files. */
  section: RoomSidebarSection
  onSectionChange: (section: RoomSidebarSection) => void
  onBack?: () => void
  onNewChat?: () => void
  chats: RoomSidebarChatItem[]
  selectedChatId: string | null
  onSelectChat: (id: string) => void
  problemGroups: RoomSidebarProblemGroup[]
  selectedProblemId: string | null
  onSelectProblem: (id: string) => void
}

const LIST_SECTIONS: Array<{
  id: RoomSidebarListSection
  label: string
  icon: typeof MessageSquare
}> = [
  { id: "chats", label: "Chattar", icon: MessageSquare },
  { id: "problems", label: "Uppgifter", icon: FileText },
]

export function RoomSidebar({
  roomName,
  roomDescription,
  section,
  onSectionChange,
  onBack,
  onNewChat,
  chats,
  selectedChatId,
  onSelectChat,
  problemGroups,
  selectedProblemId,
  onSelectProblem,
}: RoomSidebarProps) {
  const [listSection, setListSection] =
    useState<RoomSidebarListSection>("chats")

  // Keep list tab in sync when parent switches to chats/problems.
  const activeListSection =
    section === "files" ? listSection : section

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border p-3">
        {onBack ? (
          <Button
            variant="ghost"
            size="sm"
            className="mb-3 w-full justify-start gap-1.5"
            onClick={onBack}
          >
            <ArrowLeft />
            Tillbaka
          </Button>
        ) : null}
        <h1 className="truncate text-base font-medium leading-snug">
          {roomName}
        </h1>
        <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
          {roomDescription}
        </p>
      </div>

      <div className="border-b border-sidebar-border p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-1.5"
          onClick={onNewChat}
        >
          <MessageSquarePlus />
          Ny chatt
        </Button>
      </div>

      <div className="border-b border-sidebar-border p-2">
        <div
          className="grid grid-cols-2 gap-0.5 rounded-lg bg-sidebar-accent/40 p-0.5"
          role="tablist"
          aria-label="Rumsvyer"
        >
          {LIST_SECTIONS.map((item) => {
            const Icon = item.icon
            const active = activeListSection === item.id
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  // Re-clicking Chattar while already there starts a new chat
                  // (same as the "Ny chatt" button above).
                  if (
                    item.id === "chats" &&
                    active &&
                    section === "chats"
                  ) {
                    onNewChat?.()
                    return
                  }
                  setListSection(item.id)
                  onSectionChange(item.id)
                }}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-[10px] font-medium tracking-wide uppercase transition-colors",
                  active
                    ? "bg-sidebar text-sidebar-foreground shadow-sm"
                    : "text-muted-foreground hover:text-sidebar-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {activeListSection === "chats" ? (
          <ChatList
            chats={chats}
            selectedChatId={section === "chats" ? selectedChatId : null}
            onSelectChat={onSelectChat}
          />
        ) : (
          <ProblemList
            groups={problemGroups}
            selectedProblemId={
              section === "problems" ? selectedProblemId : null
            }
            onSelectProblem={onSelectProblem}
            onShowFiles={() => onSectionChange("files")}
          />
        )}
      </div>

      <div className="border-t border-sidebar-border p-2">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "w-full justify-start gap-1.5",
            section === "files" &&
              "bg-sidebar-accent text-sidebar-accent-foreground",
          )}
          onClick={() => onSectionChange("files")}
        >
          <FolderOpen />
          Filer
        </Button>
      </div>
    </aside>
  )
}

function ChatList({
  chats,
  selectedChatId,
  onSelectChat,
}: {
  chats: RoomSidebarChatItem[]
  selectedChatId: string | null
  onSelectChat: (id: string) => void
}) {
  if (chats.length === 0) {
    return (
      <p className="px-2.5 py-2 text-sm text-muted-foreground">
        Inga chattar ännu.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-0.5" aria-label="Chattar">
      {chats.map((chat) => {
        const selected = chat.id === selectedChatId
        return (
          <li key={chat.id}>
            <button
              type="button"
              onClick={() => onSelectChat(chat.id)}
              className={cn(
                "w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                selected
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent/60",
              )}
            >
              <span className="line-clamp-2 font-medium">{chat.title}</span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {(chat.problemNumbers ?? []).map((problemNumber) => (
                  <span
                    key={problemNumber}
                    className="rounded bg-sidebar-accent/80 px-1.5 py-0.5 font-medium text-sidebar-accent-foreground"
                  >
                    {problemNumber}
                  </span>
                ))}
                {chat.ttlLabel ? (
                  <span className="inline-flex items-center gap-0.5">
                    <Clock className="size-3" />
                    {chat.ttlLabel}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5">
                    <Pin className="size-3" />
                    Behålls
                  </span>
                )}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function ProblemList({
  groups,
  selectedProblemId,
  onSelectProblem,
  onShowFiles,
}: {
  groups: RoomSidebarProblemGroup[]
  selectedProblemId: string | null
  onSelectProblem: (id: string) => void
  onShowFiles: () => void
}) {
  const [query, setQuery] = useState("")
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const normalizedQuery = query.trim().toLowerCase()

  const filteredGroups = useMemo(() => {
    if (!normalizedQuery) return groups
    return groups
      .map((group) => {
        const fileMatch = group.fileName.toLowerCase().includes(normalizedQuery)
        const problems = fileMatch
          ? group.problems
          : group.problems.filter((problem) =>
              problem.problemNumber.toLowerCase().includes(normalizedQuery),
            )
        return { ...group, problems }
      })
      .filter((group) => group.problems.length > 0)
  }, [groups, normalizedQuery])

  // While searching, force-open groups that still have matches.
  useEffect(() => {
    if (!normalizedQuery) return
    setCollapsed((prev) => {
      const next = { ...prev }
      for (const group of filteredGroups) {
        next[group.fileName] = false
      }
      return next
    })
  }, [filteredGroups, normalizedQuery])

  function toggleGroup(fileName: string) {
    setCollapsed((prev) => ({
      ...prev,
      [fileName]: !prev[fileName],
    }))
  }

  if (groups.length === 0) {
    return (
      <p className="px-2.5 py-2 text-sm text-muted-foreground">
        Inga uppgifter ännu. Tolka en PDF under{" "}
        <button
          type="button"
          className="font-medium text-sidebar-foreground underline-offset-4 hover:underline"
          onClick={onShowFiles}
        >
          Filer
        </button>
        .
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2" aria-label="Uppgifter">
      <div className="relative px-0.5">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Sök uppgifter…"
          aria-label="Sök uppgifter"
          className="h-8 bg-sidebar pl-8 text-sm"
        />
      </div>

      {filteredGroups.length === 0 ? (
        <p className="px-2.5 py-2 text-sm text-muted-foreground">
          Inga träffar för “{query.trim()}”.
        </p>
      ) : (
        filteredGroups.map((group) => {
          const isCollapsed = collapsed[group.fileName] === true
          return (
            <div key={group.fileName}>
              <button
                type="button"
                onClick={() => toggleGroup(group.fileName)}
                aria-expanded={!isCollapsed}
                className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              >
                <ChevronDown
                  className={cn(
                    "size-3.5 shrink-0 transition-transform",
                    isCollapsed && "-rotate-90",
                  )}
                />
                <span className="min-w-0 flex-1 truncate normal-case">
                  {group.fileName}
                </span>
                <span className="shrink-0 tabular-nums text-[10px] normal-case">
                  {group.problems.length}
                </span>
              </button>
              {isCollapsed ? null : (
                <ul className="mt-0.5 flex flex-col gap-0.5">
                  {group.problems.map((problem) => {
                    const selected = problem.id === selectedProblemId
                    return (
                      <li key={problem.id}>
                        <button
                          type="button"
                          onClick={() => onSelectProblem(problem.id)}
                          className={cn(
                            "w-full rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                            selected
                              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                              : "hover:bg-sidebar-accent/60",
                          )}
                        >
                          {problem.problemNumber}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
