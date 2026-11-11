import { useMutation, useQuery } from "convex/react"
import {
  Archive,
  ArchiveRestore,
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
import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import {
  ProblemCompletionDisplay,
  type ProblemCompletionEntry,
} from "~/components/rooms/problem-completion"
import {
  ProblemStarsDisplay,
  type ProblemStarEntry,
} from "~/components/rooms/problem-stars"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
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
import { unitKey } from "~/lib/occasion-label"
import {
  DEFAULT_PROBLEM_LIST_MODE,
  dottedProblemMajor,
  PROBLEM_LIST_MODE_LABELS,
  PROBLEM_LIST_MODES,
  type ProblemListMode,
} from "~/lib/problem-list-mode"
import { cn } from "~/lib/utils"

export type RoomSidebarListSection = "chats" | "problems"
export type RoomSidebarSection = RoomSidebarListSection | "files" | "settings"

type RoomSidebarChatItem = {
  id: string
  title: string
  /** Remaining time label, e.g. "2h kvar". Omit when kept forever. */
  ttlLabel?: string
  /** @-mentioned problem numbers shown as badges */
  problemNumbers?: string[]
}

type RoomSidebarProblemItem = {
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

export type RoomSidebarArchivedPdf = {
  fileId: string
  fileName: string
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
  archivedProblemPdfs?: Array<RoomSidebarArchivedPdf>
  roomId?: Id<"rooms">
  selectedProblemId: string | null
  onSelectProblem: (id: string) => void
  /** Opens settings focused on problem-PDF order. */
  onOpenProblemPdfOrder?: () => void
  /** Opens settings focused on tillfällen. */
  onOpenOccasions?: () => void
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
  archivedProblemPdfs = [],
  roomId,
  selectedProblemId,
  onSelectProblem,
  onOpenProblemPdfOrder,
  onOpenOccasions,
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

      <SidebarContent className="gap-0 overflow-hidden!">
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
                  roomId={roomId}
                  groups={problemGroups}
                  archived={archivedProblemPdfs}
                  selectedProblemId={
                    section === "problems" ? selectedProblemId : null
                  }
                  onSelectProblem={onSelectProblem}
                  onShowFiles={() => onSectionChange("files")}
                  onOpenProblemPdfOrder={onOpenProblemPdfOrder}
                  onOpenOccasions={onOpenOccasions}
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

function compareProblemNumbers(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
}

function chapterCollapseKey(fileName: string, major: string) {
  return `${fileName}::${major}`
}

type ProblemChapterBucket = {
  major: string | null
  label: string | null
  problems: Array<RoomSidebarProblemItem>
}

/** Split a PDF's problems into chapter buckets by major number (tree mode). */
function bucketProblemsByChapter(
  problems: Array<RoomSidebarProblemItem>,
): Array<ProblemChapterBucket> {
  const buckets = new Map<string, ProblemChapterBucket>()
  const order: string[] = []

  for (const problem of problems) {
    const major = dottedProblemMajor(problem.problemNumber)
    const key = major ?? "__flat__"
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = {
        major,
        label: major,
        problems: [],
      }
      buckets.set(key, bucket)
      order.push(key)
    }
    bucket.problems.push(problem)
  }

  return order
    .map((key) => buckets.get(key)!)
    .sort((a, b) => {
      if (a.major === null && b.major === null) return 0
      if (a.major === null) return 1
      if (b.major === null) return -1
      return compareProblemNumbers(a.major, b.major)
    })
}

type TillfallenUnitRow = {
  key: string
  problemId: string | null
  label: string
  subproblemLetter: string
  starEntries: Array<ProblemStarEntry>
  completionEntries: Array<ProblemCompletionEntry>
}

function unitMatchesStarFilter(
  starEntries: Array<ProblemStarEntry>,
  letter: string,
  starLevelSet: Set<StarFilterLevel>,
  showAllStars: boolean,
): boolean {
  if (showAllStars) return true
  const matching = starEntries.filter((entry) => entry.letter === letter)
  if (matching.length === 0) return false
  return matching.some((entry) =>
    starLevelSet.has(entry.stars as StarFilterLevel),
  )
}

function TillfallenProblemList({
  roomId,
  query,
  starLevelSet,
  showAllStars,
  selectedProblemId,
  onSelectProblem,
  onOpenOccasions,
  collapsed,
  setCollapsed,
}: {
  roomId?: Id<"rooms">
  query: string
  starLevelSet: Set<StarFilterLevel>
  showAllStars: boolean
  selectedProblemId: string | null
  onSelectProblem: (id: string) => void
  onOpenOccasions?: () => void
  collapsed: Record<string, boolean>
  setCollapsed: Dispatch<SetStateAction<Record<string, boolean>>>
}) {
  const occasions = useQuery(
    api.roomOccasions.listByRoom,
    roomId !== undefined ? { roomId } : "skip",
  )
  const units = useQuery(
    api.roomOccasions.listAssignableUnits,
    roomId !== undefined ? { roomId } : "skip",
  )

  const occasionBuckets = useMemo(() => {
    if (occasions === undefined || units === undefined) return null

    const assignedKeys = new Set<string>()
    const unitByKey = new Map(
      units.map((unit) => [
        unitKey(unit.contentHash, unit.problemNumber, unit.subproblemLetter),
        unit,
      ] as const),
    )
    const buckets: Array<{
      id: string
      label: string
      items: Array<TillfallenUnitRow>
    }> = []

    for (const occasion of occasions) {
      const items: Array<TillfallenUnitRow> = []
      for (const assignment of occasion.assignments) {
        const key = unitKey(
          assignment.contentHash,
          assignment.problemNumber,
          assignment.subproblemLetter,
        )
        assignedKeys.add(key)
        const unit = unitByKey.get(key)
        const starEntries = unit?.starEntries ?? []
        const completionEntries = unit?.completionEntries ?? []
        if (
          !unitMatchesStarFilter(
            starEntries,
            assignment.subproblemLetter,
            starLevelSet,
            showAllStars,
          )
        ) {
          continue
        }
        const label = assignment.label
        if (
          query.length > 0 &&
          !label.toLowerCase().includes(query) &&
          !(assignment.fileName?.toLowerCase().includes(query) ?? false) &&
          !occasion.label.toLowerCase().includes(query)
        ) {
          continue
        }
        items.push({
          key,
          problemId: assignment.problemId,
          label,
          subproblemLetter: assignment.subproblemLetter,
          starEntries,
          completionEntries,
        })
      }
      buckets.push({
        id: occasion._id,
        label: occasion.label,
        items,
      })
    }

    const unassigned: Array<TillfallenUnitRow> = []
    for (const unit of units) {
      const key = unitKey(
        unit.contentHash,
        unit.problemNumber,
        unit.subproblemLetter,
      )
      if (assignedKeys.has(key) || unit.occasionId !== null) continue
      if (
        !unitMatchesStarFilter(
          unit.starEntries,
          unit.subproblemLetter,
          starLevelSet,
          showAllStars,
        )
      ) {
        continue
      }
      if (
        query.length > 0 &&
        !unit.label.toLowerCase().includes(query) &&
        !unit.fileName.toLowerCase().includes(query)
      ) {
        continue
      }
      unassigned.push({
        key,
        problemId: unit.problemId,
        label: unit.label,
        subproblemLetter: unit.subproblemLetter,
        starEntries: unit.starEntries,
        completionEntries: unit.completionEntries,
      })
    }

    return { buckets, unassigned }
  }, [occasions, units, query, starLevelSet, showAllStars])

  if (roomId === undefined) {
    return (
      <p className="px-2.5 py-2 text-sm text-muted-foreground">
        Välj ett rum för att se tillfällen.
      </p>
    )
  }

  if (occasions === undefined || units === undefined || occasionBuckets === null) {
    return (
      <p className="px-2.5 py-2 text-sm text-muted-foreground">Hämtar…</p>
    )
  }

  if (occasions.length === 0) {
    return (
      <p className="px-2.5 py-2 text-sm text-muted-foreground">
        Inga tillfällen ännu.{" "}
        {onOpenOccasions ? (
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 font-medium text-sidebar-foreground"
            onClick={onOpenOccasions}
          >
            Skapa i inställningar
          </Button>
        ) : (
          "Skapa dem under Inställningar."
        )}
      </p>
    )
  }

  const totalVisible =
    occasionBuckets.buckets.reduce((sum, bucket) => sum + bucket.items.length, 0) +
    occasionBuckets.unassigned.length

  if (totalVisible === 0) {
    return (
      <p className="px-2.5 py-2 text-sm text-muted-foreground">
        {query.length > 0
          ? "Inga träffar."
          : !showAllStars
            ? "Inga uppgifter med valda stjärnnivåer."
            : "Inga tilldelade uppgifter ännu."}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-0.5">
      {occasionBuckets.buckets.map((bucket) => {
        const isCollapsed = collapsed[`occasion:${bucket.id}`] === true
        return (
          <Collapsible
            key={bucket.id}
            open={!isCollapsed}
            onOpenChange={(open) =>
              setCollapsed((prev) => ({
                ...prev,
                [`occasion:${bucket.id}`]: !open,
              }))
            }
          >
            <CollapsibleTrigger className="sticky top-0 z-10 flex w-full items-center gap-1 rounded-md bg-sidebar px-2 py-1.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground">
              <ChevronDown
                className={cn(
                  "size-3.5 shrink-0 transition-transform",
                  isCollapsed && "-rotate-90",
                )}
              />
              <span className="min-w-0 flex-1 truncate normal-case">
                {bucket.label}
              </span>
              <Badge
                variant="secondary"
                className="shrink-0 rounded px-1.5 py-0 text-[10px] font-medium normal-case tabular-nums"
              >
                {bucket.items.length}
              </Badge>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {bucket.items.length === 0 ? (
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  Inga uppgifter.
                </p>
              ) : (
                <SidebarMenu className="mt-0.5">
                  {bucket.items.map((item) => (
                    <TillfallenUnitRow
                      key={item.key}
                      item={item}
                      selectedProblemId={selectedProblemId}
                      onSelectProblem={onSelectProblem}
                    />
                  ))}
                </SidebarMenu>
              )}
            </CollapsibleContent>
          </Collapsible>
        )
      })}

      {occasionBuckets.unassigned.length > 0 ? (
        <Collapsible
          open={collapsed["occasion:unassigned"] !== true}
          onOpenChange={(open) =>
            setCollapsed((prev) => ({
              ...prev,
              "occasion:unassigned": !open,
            }))
          }
        >
          <CollapsibleTrigger className="sticky top-0 z-10 flex w-full items-center gap-1 rounded-md bg-sidebar px-2 py-1.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground">
            <ChevronDown
              className={cn(
                "size-3.5 shrink-0 transition-transform",
                collapsed["occasion:unassigned"] === true && "-rotate-90",
              )}
            />
            <span className="min-w-0 flex-1 truncate normal-case">
              Otilldelade
            </span>
            <Badge
              variant="secondary"
              className="shrink-0 rounded px-1.5 py-0 text-[10px] font-medium normal-case tabular-nums"
            >
              {occasionBuckets.unassigned.length}
            </Badge>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenu className="mt-0.5">
              {occasionBuckets.unassigned.map((item) => (
                <TillfallenUnitRow
                  key={item.key}
                  item={item}
                  selectedProblemId={selectedProblemId}
                  onSelectProblem={onSelectProblem}
                />
              ))}
            </SidebarMenu>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  )
}

function TillfallenUnitRow({
  item,
  selectedProblemId,
  onSelectProblem,
}: {
  item: TillfallenUnitRow
  selectedProblemId: string | null
  onSelectProblem: (id: string) => void
}) {
  const selected =
    item.problemId !== null && item.problemId === selectedProblemId
  const displayStars = item.starEntries.filter(
    (entry) => entry.letter === item.subproblemLetter,
  )
  const displayCompletions = item.completionEntries.filter(
    (entry) => entry.letter === item.subproblemLetter,
  )

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={selected}
        className="h-auto py-1.5"
        disabled={item.problemId === null}
        onClick={() => {
          if (item.problemId === null) return
          onSelectProblem(item.problemId)
        }}
      >
        <span className="min-w-0 flex-1 truncate tabular-nums">{item.label}</span>
        <span className="inline-flex shrink-0 items-center gap-1.5">
          <ProblemStarsDisplay entries={displayStars} />
          <ProblemCompletionDisplay entries={displayCompletions} />
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function ProblemRow({
  problem,
  selectedProblemId,
  onSelectProblem,
}: {
  problem: RoomSidebarProblemItem
  selectedProblemId: string | null
  onSelectProblem: (id: string) => void
}) {
  const selected = problem.id === selectedProblemId
  const shadows = problem.shadows ?? []
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={selected}
        className="h-auto py-1.5"
        onClick={() => onSelectProblem(problem.id)}
      >
        <span className="min-w-0 flex-1 truncate">{problem.problemNumber}</span>
        <span className="inline-flex shrink-0 items-center gap-1.5">
          <ProblemStarsDisplay entries={problem.starEntries} />
          <ProblemCompletionDisplay entries={problem.completionEntries ?? []} />
        </span>
      </SidebarMenuButton>
      {shadows.length > 0 ? (
        <SidebarMenuSub className="mx-0 ml-3 mr-0">
          {shadows.map((shadow) => {
            const shadowSelected = shadow.id === selectedProblemId
            return (
              <SidebarMenuSubItem key={shadow.id} className="w-full">
                <SidebarMenuSubButton
                  render={<button type="button" />}
                  isActive={shadowSelected}
                  size="sm"
                  className="w-full"
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
}

function ProblemList({
  roomId,
  groups,
  archived,
  selectedProblemId,
  onSelectProblem,
  onShowFiles,
  onOpenProblemPdfOrder,
  onOpenOccasions,
}: {
  roomId?: Id<"rooms">
  groups: RoomSidebarProblemGroup[]
  archived: Array<RoomSidebarArchivedPdf>
  selectedProblemId: string | null
  onSelectProblem: (id: string) => void
  onShowFiles: () => void
  onOpenProblemPdfOrder?: () => void
  onOpenOccasions?: () => void
}) {
  const viewer = useQuery(api.users.viewer)
  const updateProblemListMode = useMutation(api.users.updateProblemListMode)
  const archiveProblems = useMutation(
    api.PDFParse.problems.archiveProblemsFromRoom,
  )
  const unarchiveProblems = useMutation(
    api.PDFParse.problems.unarchiveProblemsFromRoom,
  )
  const mode: ProblemListMode =
    viewer?.problemListMode ?? DEFAULT_PROBLEM_LIST_MODE

  const [query, setQuery] = useState("")
  const [starLevels, setStarLevels] = useState<Array<string>>([])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [archivePickerOpen, setArchivePickerOpen] = useState(false)
  const [pendingArchive, setPendingArchive] = useState<{
    fileId: string
    fileName: string
  } | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const [unarchivingId, setUnarchivingId] = useState<string | null>(null)

  const archivableGroups = useMemo(
    () => groups.filter((group) => group.fileId !== undefined),
    [groups],
  )

  const normalizedQuery = query.trim().toLowerCase()
  const showAllStars = starLevels.length === 0
  const starLevelSet = useMemo(
    () => new Set(starLevels.map((v) => Number(v) as StarFilterLevel)),
    [starLevels],
  )

  const filteredGroups = useMemo(() => {
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

  // While searching, force-open groups (and chapters) that still have matches.
  useEffect(() => {
    if (!normalizedQuery) return
    setCollapsed((prev) => {
      const next = { ...prev }
      for (const group of filteredGroups) {
        next[group.fileName] = false
        if (mode === "tree") {
          for (const bucket of bucketProblemsByChapter(group.problems)) {
            if (bucket.major !== null) {
              next[chapterCollapseKey(group.fileName, bucket.major)] = false
            }
          }
        }
      }
      return next
    })
  }, [filteredGroups, mode, normalizedQuery])

  if (groups.length === 0 && archived.length === 0) {
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

  async function confirmArchive() {
    if (pendingArchive === null || roomId === undefined) return
    setArchiving(true)
    setArchiveError(null)
    try {
      await archiveProblems({
        roomId,
        fileId: pendingArchive.fileId as Id<"files">,
      })
      setPendingArchive(null)
      setArchivePickerOpen(false)
      setArchivedOpen(true)
    } catch (error) {
      setArchiveError(
        error instanceof Error ? error.message : "Kunde inte arkivera",
      )
    } finally {
      setArchiving(false)
    }
  }

  async function handleUnarchive(fileId: string) {
    if (roomId === undefined) return
    setUnarchivingId(fileId)
    try {
      await unarchiveProblems({
        roomId,
        fileId: fileId as Id<"files">,
      })
    } finally {
      setUnarchivingId(null)
    }
  }

  const emptyMessage =
    normalizedQuery.length > 0
      ? `Inga träffar för “${query.trim()}”.`
      : !showAllStars
        ? "Inga uppgifter med valda stjärnnivåer."
        : "Inga uppgifter."

  return (
    <div className="flex flex-col gap-2" aria-label="Uppgifter">
      {groups.length > 0 ? (
        <>
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

      <div
        className="flex w-full items-stretch gap-0.5 rounded-lg bg-sidebar-accent/40 p-0.5"
        role="group"
        aria-label="Uppgiftslistans vy"
      >
        {PROBLEM_LIST_MODES.map((value) => {
          const active = mode === value
          return (
            <Button
              key={value}
              type="button"
              variant="ghost"
              size="sm"
              disabled={viewer === undefined}
              aria-pressed={active}
              onClick={() => {
                if (active) return
                void updateProblemListMode({ problemListMode: value })
              }}
              className={cn(
                "h-7 min-w-0 flex-1 rounded-md px-1 text-[10px] font-medium shadow-none",
                active && "bg-sidebar text-sidebar-foreground shadow-sm",
              )}
            >
              {PROBLEM_LIST_MODE_LABELS[value]}
            </Button>
          )
        })}
      </div>

      <ToggleGroup
        multiple
        value={starLevels}
        onValueChange={(next) => {
          if (next.includes("all")) {
            setStarLevels([])
            return
          }

          setStarLevels(next)
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

      {mode === "tillfallen" ? (
        <TillfallenProblemList
          roomId={roomId}
          query={normalizedQuery}
          starLevelSet={starLevelSet}
          showAllStars={showAllStars}
          selectedProblemId={selectedProblemId}
          onSelectProblem={onSelectProblem}
          onOpenOccasions={onOpenOccasions}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
        />
      ) : null}

      {mode !== "tillfallen" ? (
      <>
      {filteredGroups.length === 0 ? (
        <p className="px-2.5 py-2 text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        filteredGroups.map((group) => {
          const isCollapsed = collapsed[group.fileName] === true
          const chapterBuckets =
            mode === "tree" ? bucketProblemsByChapter(group.problems) : null
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
              <CollapsibleTrigger className="sticky top-0 z-10 flex w-full items-center gap-1 rounded-md bg-sidebar px-2 py-1.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground">
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
                {chapterBuckets ? (
                  <div className="mt-0.5 flex flex-col gap-0.5">
                    {chapterBuckets.map((bucket) => {
                      if (bucket.major === null || bucket.label === null) {
                        return (
                          <SidebarMenu key={bucket.problems[0]?.id ?? "flat"}>
                            {bucket.problems.map((problem) => (
                              <ProblemRow
                                key={problem.id}
                                problem={problem}
                                selectedProblemId={selectedProblemId}
                                onSelectProblem={onSelectProblem}
                              />
                            ))}
                          </SidebarMenu>
                        )
                      }

                      const chapterKey = chapterCollapseKey(
                        group.fileName,
                        bucket.major,
                      )
                      const chapterCollapsed = collapsed[chapterKey] === true
                      return (
                        <Collapsible
                          key={chapterKey}
                          open={!chapterCollapsed}
                          onOpenChange={(open) =>
                            setCollapsed((prev) => ({
                              ...prev,
                              [chapterKey]: !open,
                            }))
                          }
                        >
                          <CollapsibleTrigger className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-[11px] font-medium tracking-wide text-muted-foreground uppercase transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground">
                            <ChevronDown
                              className={cn(
                                "size-3 shrink-0 transition-transform",
                                chapterCollapsed && "-rotate-90",
                              )}
                            />
                            <span className="min-w-0 flex-1 truncate normal-case tabular-nums">
                              {bucket.label}
                            </span>
                            <Badge
                              variant="secondary"
                              className="shrink-0 rounded px-1.5 py-0 text-[10px] font-medium normal-case tabular-nums"
                            >
                              {bucket.problems.length}
                            </Badge>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenu className="mt-0.5 ml-1 border-l border-sidebar-border pl-1">
                              {bucket.problems.map((problem) => (
                                <ProblemRow
                                  key={problem.id}
                                  problem={problem}
                                  selectedProblemId={selectedProblemId}
                                  onSelectProblem={onSelectProblem}
                                />
                              ))}
                            </SidebarMenu>
                          </CollapsibleContent>
                        </Collapsible>
                      )
                    })}
                  </div>
                ) : (
                  <SidebarMenu className="mt-0.5">
                    {group.problems.map((problem) => (
                      <ProblemRow
                        key={problem.id}
                        problem={problem}
                        selectedProblemId={selectedProblemId}
                        onSelectProblem={onSelectProblem}
                      />
                    ))}
                  </SidebarMenu>
                )}
              </CollapsibleContent>
            </Collapsible>
          )
        })
      )}
      </>
      ) : null}
        </>
      ) : null}

      {mode !== "tillfallen" &&
      (archived.length > 0 ||
        (roomId !== undefined && archivableGroups.length > 0)) ? (
        <Collapsible open={archivedOpen} onOpenChange={setArchivedOpen}>
          <CollapsibleTrigger className="mt-1 flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground">
            <ChevronDown
              className={cn(
                "size-3.5 shrink-0 transition-transform",
                !archivedOpen && "-rotate-90",
              )}
            />
            <span className="min-w-0 flex-1 truncate normal-case">
              Arkiverade
            </span>
            {archived.length > 0 ? (
              <Badge
                variant="secondary"
                className="shrink-0 rounded px-1.5 py-0 text-[10px] font-medium normal-case tabular-nums"
              >
                {archived.length}
              </Badge>
            ) : null}
          </CollapsibleTrigger>
          <CollapsibleContent>
            {archived.length > 0 ? (
              <ul className="mt-0.5 flex flex-col gap-0.5">
                {archived.map((item) => (
                  <li
                    key={item.fileId}
                    className="flex items-center gap-0.5 rounded-md px-2 py-1 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {item.fileName}
                    </span>
                    {roomId !== undefined ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="size-7 shrink-0 text-muted-foreground hover:text-sidebar-foreground"
                        aria-label={`Visa uppgifter från ${item.fileName} igen`}
                        title="Visa igen"
                        disabled={unarchivingId === item.fileId}
                        onClick={() => {
                          void handleUnarchive(item.fileId)
                        }}
                      >
                        <ArchiveRestore className="size-3.5" />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-2 py-1 text-xs text-muted-foreground">
                Inga arkiverade PDF:er.
              </p>
            )}
            {roomId !== undefined && archivableGroups.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setArchiveError(null)
                  setPendingArchive(null)
                  setArchivePickerOpen(true)
                }}
                className="mt-0.5 h-auto w-full justify-start gap-1.5 px-2 py-1.5 text-xs font-medium text-muted-foreground"
              >
                <Archive className="size-3.5" />
                Arkivera PDF…
              </Button>
            ) : null}
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      {mode !== "tillfallen" &&
      groups.length > 0 &&
      onOpenProblemPdfOrder ? (
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

      {mode === "tillfallen" && onOpenOccasions ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onOpenOccasions}
          className="mt-1 h-auto w-full justify-start px-2.5 py-1.5 text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
        >
          Hantera tillfällen
        </Button>
      ) : null}

      <Dialog
        open={archivePickerOpen}
        onOpenChange={(open) => {
          if (archiving) return
          setArchivePickerOpen(open)
          if (!open) {
            setPendingArchive(null)
            setArchiveError(null)
          }
        }}
      >
        <DialogContent showCloseButton={!archiving}>
          <DialogHeader>
            <DialogTitle>
              {pendingArchive ? "Arkivera uppgifter?" : "Arkivera PDF"}
            </DialogTitle>
            <DialogDescription>
              {pendingArchive
                ? `Uppgifterna från “${pendingArchive.fileName}” flyttas till Arkiverade i det här rummet. PDF:en och den delade tolkningen sparas.`
                : "Välj en PDF vars uppgifter ska döljas från listan i det här rummet."}
            </DialogDescription>
          </DialogHeader>
          {archiveError ? (
            <p className="text-sm text-destructive">{archiveError}</p>
          ) : null}
          {pendingArchive === null ? (
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {archivableGroups.map((group) => (
                <li key={group.fileId}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-start px-2 py-2 text-left text-sm font-normal"
                    onClick={() => {
                      setArchiveError(null)
                      setPendingArchive({
                        fileId: group.fileId!,
                        fileName: group.fileName,
                      })
                    }}
                  >
                    <span className="truncate">{group.fileName}</span>
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <DialogFooter>
            {pendingArchive !== null ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={archiving}
                  onClick={() => {
                    setPendingArchive(null)
                    setArchiveError(null)
                  }}
                >
                  Tillbaka
                </Button>
                <Button
                  disabled={archiving}
                  onClick={() => {
                    void confirmArchive()
                  }}
                >
                  {archiving ? "Arkiverar…" : "Arkivera"}
                </Button>
              </>
            ) : (
              <DialogClose render={<Button variant="outline" />}>
                Avbryt
              </DialogClose>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
