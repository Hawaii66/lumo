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
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
import { ScrollArea } from "~/components/ui/scroll-area"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "~/components/ui/sidebar"
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group"
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
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-0 border-b border-sidebar-border p-0">
        <div className="p-3">
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

        <div className="border-t border-sidebar-border p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={onNewChat}>
                <MessageSquarePlus />
                <span>Ny chatt</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>

        <div className="border-t border-sidebar-border p-2">
          <Tabs
            value={activeListSection}
            onValueChange={(value) => {
              const next = value as RoomSidebarListSection
              // Re-clicking Chattar while already there starts a new chat
              // (same as the "Ny chatt" button above). Handled via trigger onClick.
              setListSection(next)
              onSectionChange(next)
            }}
          >
            <TabsList
              className="grid h-auto! w-full grid-cols-2 bg-sidebar-accent/40"
              aria-label="Rumsvyer"
            >
              <TabsTrigger
                value="problems"
                className="flex h-auto! flex-col gap-0.5 py-1.5 text-[10px] font-medium tracking-wide uppercase data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground data-active:shadow-sm"
              >
                <FileText className="size-3.5" />
                Uppgifter
              </TabsTrigger>
              <TabsTrigger
                value="chats"
                className="flex h-auto! flex-col gap-0.5 py-1.5 text-[10px] font-medium tracking-wide uppercase data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground data-active:shadow-sm"
                onClick={() => {
                  if (activeListSection === "chats" && section === "chats") {
                    onNewChat?.()
                  }
                }}
              >
                <MessageSquare className="size-3.5" />
                Chattar
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <ScrollArea className="h-full">
          <SidebarGroup className="px-2 py-2">
            <SidebarGroupContent>
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
            </SidebarGroupContent>
          </SidebarGroup>
        </ScrollArea>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={section === "files"}
              onClick={() => onSectionChange("files")}
            >
              <FolderOpen />
              <span>Filer</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={section === "settings"}
              onClick={() => onSectionChange("settings")}
            >
              <Settings />
              <span>Inställningar</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
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
    <SidebarMenu aria-label="Chattar">
      {chats.map((chat) => {
        const selected = chat.id === selectedChatId
        return (
          <SidebarMenuItem key={chat.id}>
            <SidebarMenuButton
              isActive={selected}
              className="h-auto items-start py-2"
              onClick={() => onSelectChat(chat.id)}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1 text-left">
                <span className="line-clamp-2 font-medium">{chat.title}</span>
                <span className="flex flex-wrap items-center gap-1.5 text-xs font-normal text-muted-foreground">
                  {(chat.problemNumbers ?? []).map((problemNumber) => (
                    <Badge
                      key={problemNumber}
                      variant="secondary"
                      className="rounded px-1.5 py-0 text-[10px] font-medium"
                    >
                      {problemNumber}
                    </Badge>
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
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
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
  const [starLevels, setStarLevels] = useState<Array<string>>([])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const normalizedQuery = query.trim().toLowerCase()
  const showAllStars = starLevels.length === 0
  const starLevelSet = useMemo(
    () => new Set(starLevels.map((v) => Number(v) as StarFilterLevel)),
    [starLevels],
  )

  const filteredGroups = useMemo(() => {
    const compareProblemNumbers = (a: string, b: string) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })

    const sortGroup = (
      group: RoomSidebarProblemGroup,
    ): RoomSidebarProblemGroup => ({
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
      starLevelSet.size === 0
        ? searched
        : searched
            .map((group) => ({
              ...group,
              problems: group.problems.filter((problem) =>
                problem.starEntries.some((entry) =>
                  starLevelSet.has(entry.stars as StarFilterLevel),
                ),
              ),
            }))
            .filter((group) => group.problems.length > 0)

    // Preserve backend group order (problemSortOrder); only sort within groups.
    return source.map(sortGroup)
  }, [groups, normalizedQuery, starLevelSet])

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

  if (groups.length === 0) {
    return (
      <p className="px-2.5 py-2 text-sm text-muted-foreground">
        Inga uppgifter ännu. Tolka en PDF under{" "}
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 font-medium text-sidebar-foreground"
          onClick={onShowFiles}
        >
          Filer
        </Button>
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

  return (
    <div className="flex flex-col gap-2" aria-label="Uppgifter">
      <div className="relative px-0.5">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <SidebarInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Sök uppgifter…"
          aria-label="Sök uppgifter"
          className="h-8 bg-sidebar pl-8 text-sm"
        />
      </div>

      <ToggleGroup
        multiple
        value={starLevels}
        onValueChange={(next) => {
          // Empty selection = show all; "all" sentinel clears filters.
          setStarLevels(next.filter((v) => v !== "all"))
        }}
        size="sm"
        variant="outline"
        className="flex w-full items-stretch gap-0.5 rounded-lg border-0 bg-sidebar-accent/40 p-0.5"
        aria-label="Filtrera efter stjärnor"
      >
        <ToggleGroupItem
          value="all"
          aria-label="Visa alla uppgifter (0–3 stjärnor)"
          aria-pressed={showAllStars}
          className={cn(
            "h-7 min-w-0 flex-1 rounded-md! border-0 px-1 text-[10px] font-medium leading-none shadow-none",
            showAllStars && "bg-sidebar text-sidebar-foreground shadow-sm",
          )}
          onClick={() => setStarLevels([])}
        >
          Alla
        </ToggleGroupItem>
        <div className="flex min-w-0 flex-[3] items-stretch">
          {STAR_LEVEL_OPTIONS.map((option) => {
            const active = starLevelSet.has(option.level)
            const joinsLeft =
              active &&
              starLevelSet.has((option.level - 1) as StarFilterLevel)
            const joinsRight =
              active &&
              starLevelSet.has((option.level + 1) as StarFilterLevel)
            return (
              <ToggleGroupItem
                key={option.level}
                value={String(option.level)}
                title={option.title}
                aria-label={option.title}
                className={cn(
                  "h-7 min-w-0 flex-1 gap-px border-0 px-1 shadow-none",
                  active && "bg-sidebar text-sidebar-foreground shadow-sm",
                  // Contiguous selections share flat edges; outer ends stay rounded.
                  !joinsLeft && !joinsRight && "rounded-md!",
                  !joinsLeft && joinsRight && "rounded-l-md! rounded-r-none!",
                  joinsLeft && !joinsRight && "rounded-l-none! rounded-r-md!",
                  joinsLeft && joinsRight && "rounded-none!",
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
              </ToggleGroupItem>
            )
          })}
        </div>
      </ToggleGroup>

      {filteredGroups.length === 0 ? (
        <p className="px-2.5 py-2 text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        filteredGroups.map((group) => {
          const isCollapsed = collapsed[group.fileName] === true
          return (
            <Collapsible
              key={group.fileId ?? group.fileName}
              open={!isCollapsed}
              onOpenChange={(open) =>
                setCollapsed((prev) => ({
                  ...prev,
                  [group.fileName]: !open,
                }))
              }
            >
              <CollapsibleTrigger className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground">
                <ChevronDown
                  className={cn(
                    "size-3.5 shrink-0 transition-transform",
                    isCollapsed && "-rotate-90",
                  )}
                />
                <span className="min-w-0 flex-1 truncate normal-case">
                  {group.fileName}
                </span>
                <Badge
                  variant="secondary"
                  className="shrink-0 rounded px-1.5 py-0 text-[10px] font-medium normal-case tabular-nums"
                >
                  {group.problems.length}
                </Badge>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenu className="mt-0.5">
                  {group.problems.map((problem) => {
                    const selected = problem.id === selectedProblemId
                    const shadows = problem.shadows ?? []
                    return (
                      <SidebarMenuItem key={problem.id}>
                        <SidebarMenuButton
                          isActive={selected}
                          className="h-auto py-1.5"
                          onClick={() => onSelectProblem(problem.id)}
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
                        </SidebarMenuButton>
                        {shadows.length > 0 ? (
                          <SidebarMenuSub>
                            {shadows.map((shadow) => {
                              const shadowSelected =
                                shadow.id === selectedProblemId
                              return (
                                <SidebarMenuSubItem key={shadow.id}>
                                  <SidebarMenuSubButton
                                    render={<button type="button" />}
                                    isActive={shadowSelected}
                                    size="sm"
                                    onClick={() => onSelectProblem(shadow.id)}
                                  >
                                    {shadow.problemNumber}
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              )
                            })}
                          </SidebarMenuSub>
                        ) : null}
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </CollapsibleContent>
            </Collapsible>
          )
        })
      )}

      {groups.length > 0 && onOpenProblemPdfOrder ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onOpenProblemPdfOrder}
          className="mt-1 h-auto w-full justify-start px-2.5 py-1.5 text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
        >
          Ordna PDF:er
        </Button>
      ) : null}
    </div>
  )
}
