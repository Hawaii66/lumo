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
  Settings,
  Star,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import {
  ProblemCompletionDisplay,
  type ProblemCompletionEntry,
} from "~/components/rooms/problem-completion"
import {
  ProblemStarsDisplay,
  type ProblemStarEntry,
  type ProblemStars,
} from "~/components/rooms/problem-stars"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { cn } from "~/lib/utils"

export type { ProblemStars }

export type RoomSidebarListSection = "chats" | "problems"
export type RoomSidebarSection = RoomSidebarListSection | "files" | "settings"

export type RoomSidebarChatItem = {
  id: string
  title: string
  /** Remaining time label, e.g. "2h kvar". Omit when kept forever. */
  ttlLabel?: string
  /** @-mentioned problem numbers shown as badges */
  problemNumbers?: string[]
}

export type RoomSidebarProblemItem = {
  id: string
  problemNumber: string
  /** Room-scoped difficulty per deluppgift (or whole problem as letter `""`). */
  starEntries: Array<ProblemStarEntry>
  /** Room-scoped completion marks (personal; not cloned from templates). */
  completionEntries?: Array<ProblemCompletionEntry>
  shadows?: Array<{
    id: string
    problemNumber: string
  }>
}

export type RoomSidebarProblemGroup = {
  fileId?: string
  fileName: string
  problems: Array<RoomSidebarProblemItem>
}

export type RoomSidebarProps = {
  roomName: string
  roomDescription: string
  /** Main pane view: chats, problems, files, or settings. */
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
  /** Opens settings focused on problem-PDF order. */
  onOpenProblemPdfOrder?: () => void
}

type StarFilterLevel = 1 | 2 | 3

const STAR_LEVEL_OPTIONS: Array<{
  level: StarFilterLevel
  title: string
}> = [
  { level: 1, title: "Visa 1 stjärna" },
  { level: 2, title: "Visa 2 stjärnor" },
  { level: 3, title: "Visa 3 stjärnor" },
]

const LIST_SECTIONS: Array<{
  id: RoomSidebarListSection
  label: string
  icon: typeof MessageSquare
}> = [
  { id: "problems", label: "Uppgifter", icon: FileText },
  { id: "chats", label: "Chattar", icon: MessageSquare },
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
  onOpenProblemPdfOrder,
}: RoomSidebarProps) {
  const [listSection, setListSection] =
    useState<RoomSidebarListSection>("problems")

  // Keep list tab in sync when parent switches to chats/problems.
  const activeListSection =
    section === "files" || section === "settings" ? listSection : section

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
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
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
            onOpenProblemPdfOrder={onOpenProblemPdfOrder}
          />
        )}
      </div>

      <div className="flex flex-col gap-0.5 border-t border-sidebar-border p-2">
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
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "w-full justify-start gap-1.5",
            section === "settings" &&
              "bg-sidebar-accent text-sidebar-accent-foreground",
          )}
          onClick={() => onSectionChange("settings")}
        >
          <Settings />
          Inställningar
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
  onOpenProblemPdfOrder,
}: {
  groups: RoomSidebarProblemGroup[]
  selectedProblemId: string | null
  onSelectProblem: (id: string) => void
  onShowFiles: () => void
  onOpenProblemPdfOrder?: () => void
}) {
  const [query, setQuery] = useState("")
  const [starLevels, setStarLevels] = useState<Set<StarFilterLevel>>(
    () => new Set(),
  )
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const normalizedQuery = query.trim().toLowerCase()
  const showAllStars = starLevels.size === 0

  const filteredGroups = useMemo(() => {
    const compareProblemNumbers = (a: string, b: string) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })

    const sortGroup = (group: RoomSidebarProblemGroup): RoomSidebarProblemGroup => ({
      ...group,
      problems: [...group.problems]
        .map((problem) => ({
          ...problem,
          shadows: [...(problem.shadows ?? [])].sort((a, b) =>
            compareProblemNumbers(a.problemNumber, b.problemNumber),
          ),
        }))
        .sort((a, b) =>
          compareProblemNumbers(a.problemNumber, b.problemNumber),
        ),
    })

    const searched = normalizedQuery
      ? groups
          .map((group) => {
            const fileMatch = group.fileName
              .toLowerCase()
              .includes(normalizedQuery)
            if (fileMatch) return group
            const problems = group.problems
              .map((problem) => {
                const parentMatch = problem.problemNumber
                  .toLowerCase()
                  .includes(normalizedQuery)
                const shadows = (problem.shadows ?? []).filter((shadow) =>
                  shadow.problemNumber
                    .toLowerCase()
                    .includes(normalizedQuery),
                )
                if (parentMatch) return problem
                if (shadows.length > 0) return { ...problem, shadows }
                return null
              })
              .filter(
                (problem): problem is RoomSidebarProblemItem =>
                  problem !== null,
              )
            return { ...group, problems }
          })
          .filter((group) => group.problems.length > 0)
      : groups

    const source =
      starLevels.size === 0
        ? searched
        : searched
            .map((group) => ({
              ...group,
              problems: group.problems.filter((problem) =>
                problem.starEntries.some((entry) =>
                  starLevels.has(entry.stars as StarFilterLevel),
                ),
              ),
            }))
            .filter((group) => group.problems.length > 0)

    // Preserve backend group order (problemSortOrder); only sort within groups.
    return source.map(sortGroup)
  }, [groups, normalizedQuery, starLevels])

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

  const emptyMessage =
    normalizedQuery.length > 0
      ? `Inga träffar för “${query.trim()}”.`
      : !showAllStars
        ? "Inga uppgifter med valda stjärnnivåer."
        : "Inga uppgifter."

  function clearStarFilter() {
    setStarLevels(new Set())
  }

  function toggleStarLevel(level: StarFilterLevel) {
    setStarLevels((prev) => {
      const next = new Set(prev)
      if (next.has(level)) next.delete(level)
      else next.add(level)
      return next
    })
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

      <div
        className="grid grid-cols-4 gap-0.5 rounded-lg bg-sidebar-accent/40 p-0.5"
        role="group"
        aria-label="Filtrera efter stjärnor"
      >
        <button
          type="button"
          title="Visa alla uppgifter (0–3 stjärnor)"
          aria-pressed={showAllStars}
          onClick={clearStarFilter}
          className={cn(
            "rounded-md px-1 py-1 text-[10px] font-medium transition-colors",
            showAllStars
              ? "bg-sidebar text-sidebar-foreground shadow-sm"
              : "text-muted-foreground hover:text-sidebar-foreground",
          )}
        >
          Alla
        </button>
        {STAR_LEVEL_OPTIONS.map((option) => {
          const active = starLevels.has(option.level)
          return (
            <button
              key={option.level}
              type="button"
              title={option.title}
              aria-label={option.title}
              aria-pressed={active}
              onClick={() => toggleStarLevel(option.level)}
              className={cn(
                "flex items-center justify-center gap-px rounded-md px-1 py-1 transition-colors",
                active
                  ? "bg-sidebar text-sidebar-foreground shadow-sm"
                  : "text-muted-foreground hover:text-sidebar-foreground",
              )}
            >
              {Array.from({ length: option.level }, (_, i) => (
                <Star
                  key={i}
                  className={cn(
                    "size-2.5",
                    active
                      ? "fill-amber-500 text-amber-500"
                      : "fill-none text-muted-foreground",
                  )}
                  aria-hidden
                />
              ))}
            </button>
          )
        })}
      </div>

      {filteredGroups.length === 0 ? (
        <p className="px-2.5 py-2 text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        filteredGroups.map((group) => {
          const isCollapsed = collapsed[group.fileName] === true
          return (
            <div key={group.fileId ?? group.fileName}>
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
                    const shadows = problem.shadows ?? []
                    return (
                      <li key={problem.id}>
                        <button
                          type="button"
                          onClick={() => onSelectProblem(problem.id)}
                          className={cn(
                            "flex w-full items-center gap-1 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                            selected
                              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                              : "hover:bg-sidebar-accent/60",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {problem.problemNumber}
                          </span>
                          <span className="inline-flex shrink-0 items-center gap-1.5">
                            <ProblemStarsDisplay entries={problem.starEntries} />
                            <ProblemCompletionDisplay
                              entries={problem.completionEntries ?? []}
                            />
                          </span>
                        </button>
                        {shadows.length > 0 ? (
                          <ul className="mt-0.5 ml-3 flex flex-col gap-0.5 border-l border-sidebar-border pl-2">
                            {shadows.map((shadow) => {
                              const shadowSelected =
                                shadow.id === selectedProblemId
                              return (
                                <li key={shadow.id}>
                                  <button
                                    type="button"
                                    onClick={() => onSelectProblem(shadow.id)}
                                    className={cn(
                                      "w-full rounded-lg px-2 py-1 text-left text-sm text-muted-foreground transition-colors",
                                      shadowSelected
                                        ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                                        : "hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                                    )}
                                  >
                                    {shadow.problemNumber}
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })
      )}

      {groups.length > 0 && onOpenProblemPdfOrder ? (
        <button
          type="button"
          onClick={onOpenProblemPdfOrder}
          className="mt-1 w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground hover:underline"
        >
          Ordna PDF:er
        </button>
      ) : null}
    </div>
  )
}
