import { useMutation, useQuery } from "convex/react"
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Eye,
  GripVertical,
  X,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import {
  ProblemOccasionControl,
  type ProblemOccasionOption,
} from "~/components/rooms/problem-occasion"
import {
  ProblemStarsControl,
  starsForLetter,
  type ProblemStars,
} from "~/components/rooms/problem-stars"
import {
  ProblemAssignmentPreviewSheet,
  type ProblemPreviewTab,
} from "~/components/rooms/room-settings/problem-assignment-preview-sheet"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { dottedProblemMajor } from "~/lib/problem-list-mode"
import { cn } from "~/lib/utils"

type UnitKey = string

function unitKey(
  contentHash: string,
  problemNumber: string,
  subproblemLetter: string,
): UnitKey {
  return `${contentHash}\0${problemNumber}\0${subproblemLetter}`
}

type OrderedUnit = {
  contentHash: string
  problemNumber: string
  subproblemLetter: string
}

type AssignableUnit = {
  contentHash: string
  problemNumber: string
  subproblemLetter: string
  problemId: Id<"problems">
  fileId: Id<"files">
  fileName: string
  label: string
  occasionId: Id<"roomOccasions"> | null
  occasionName: string | null
  starEntries: Array<{ letter: string; stars: 1 | 2 | 3 }>
  completionEntries: Array<{ letter: string }>
  reasonEntries: Array<{
    letter: string
    reason: "hard" | "insight" | "teacher" | "other"
    note?: string
  }>
}

const ALL_PDFS_VALUE = "__all__"

function compareProblemNumbers(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
}

type ChapterBucket = {
  major: string | null
  label: string | null
  units: Array<AssignableUnit>
}

function bucketUnitsByChapter(
  units: Array<AssignableUnit>,
): Array<ChapterBucket> {
  const buckets = new Map<string, ChapterBucket>()
  const order: Array<string> = []

  for (const unit of units) {
    const major = dottedProblemMajor(unit.problemNumber)
    const key = major ?? "__flat__"
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { major, label: major, units: [] }
      buckets.set(key, bucket)
      order.push(key)
    }
    bucket.units.push(unit)
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

type PdfGroup = {
  fileId: Id<"files">
  fileName: string
  units: Array<AssignableUnit>
}

function groupUnitsByPdf(units: Array<AssignableUnit>): Array<PdfGroup> {
  const groups = new Map<string, PdfGroup>()
  const order: Array<string> = []
  for (const unit of units) {
    const key = unit.fileId
    let group = groups.get(key)
    if (!group) {
      group = { fileId: unit.fileId, fileName: unit.fileName, units: [] }
      groups.set(key, group)
      order.push(key)
    }
    group.units.push(unit)
  }
  return order.map((key) => groups.get(key)!)
}

type ProblemUnitGroup = {
  key: string
  problemNumber: string
  units: Array<AssignableUnit>
}

/** Group consecutive units that share the same problem (for deluppgifter). */
function groupUnitsByProblem(
  units: Array<AssignableUnit>,
): Array<ProblemUnitGroup> {
  const groups: Array<ProblemUnitGroup> = []
  for (const unit of units) {
    const key = `${unit.contentHash}\0${unit.problemNumber}`
    const last = groups[groups.length - 1]
    if (last !== undefined && last.key === key) {
      last.units.push(unit)
    } else {
      groups.push({
        key,
        problemNumber: unit.problemNumber,
        units: [unit],
      })
    }
  }
  return groups
}

export function RoomProblemAssignmentsCard({
  roomId,
}: {
  roomId: Id<"rooms">
}) {
  const occasions = useQuery(api.roomOccasions.listByRoom, { roomId })
  const units = useQuery(api.roomOccasions.listAssignableUnits, { roomId })
  const setStars = useMutation(api.PDFParse.problems.setStars)
  const setForProblem = useMutation(api.roomOccasions.setForProblem)
  const assignUnits = useMutation(api.roomOccasions.assignUnits)
  const setAssignmentOrder = useMutation(api.roomOccasions.setAssignmentOrder)

  const occasionOptions: Array<ProblemOccasionOption> = useMemo(
    () =>
      (occasions ?? []).map((occasion) => ({
        id: occasion._id,
        label: occasion.label,
      })),
    [occasions],
  )

  const unitByKey = useMemo(() => {
    const map = new Map<
      UnitKey,
      NonNullable<typeof units>[number]
    >()
    for (const unit of units ?? []) {
      map.set(
        unitKey(unit.contentHash, unit.problemNumber, unit.subproblemLetter),
        unit,
      )
    }
    return map
  }, [units])

  const [orderedByOccasion, setOrderedByOccasion] = useState<
    Record<string, Array<OrderedUnit>> | null
  >(null)
  const [dirtyOccasionIds, setDirtyOccasionIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [pendingOccasionId, setPendingOccasionId] = useState<string | null>(
    null,
  )
  const [errorByOccasion, setErrorByOccasion] = useState<
    Record<string, string>
  >({})
  const [savedOccasionId, setSavedOccasionId] = useState<string | null>(null)
  const [unassignedPdfFilter, setUnassignedPdfFilter] =
    useState<string>(ALL_PDFS_VALUE)
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({})
  const [selectedOrder, setSelectedOrder] = useState<Array<UnitKey>>([])
  const [bulkStars, setBulkStars] = useState<ProblemStars>(0)
  const [bulkOccasionId, setBulkOccasionId] = useState<string | null>(null)
  const [bulkPending, setBulkPending] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [previewProblemId, setPreviewProblemId] =
    useState<Id<"problems"> | null>(null)
  const [previewTab, setPreviewTab] = useState<ProblemPreviewTab>("parsed")

  const selectedKeys = useMemo(
    () => new Set(selectedOrder),
    [selectedOrder],
  )

  function openPreview(
    problemId: Id<"problems">,
    tab: ProblemPreviewTab = "parsed",
  ) {
    setPreviewTab(tab)
    setPreviewProblemId(problemId)
  }

  useEffect(() => {
    if (occasions === undefined) return
    setOrderedByOccasion((prev) => {
      const next: Record<string, Array<OrderedUnit>> = {}
      for (const occasion of occasions) {
        const serverUnits = occasion.assignments.map((assignment) => ({
          contentHash: assignment.contentHash,
          problemNumber: assignment.problemNumber,
          subproblemLetter: assignment.subproblemLetter,
        }))
        if (dirtyOccasionIds.has(occasion._id) && prev?.[occasion._id]) {
          const serverKeys = new Set(
            serverUnits.map((unit) =>
              unitKey(
                unit.contentHash,
                unit.problemNumber,
                unit.subproblemLetter,
              ),
            ),
          )
          const kept = prev[occasion._id]!.filter((unit) =>
            serverKeys.has(
              unitKey(
                unit.contentHash,
                unit.problemNumber,
                unit.subproblemLetter,
              ),
            ),
          )
          const keptKeys = new Set(
            kept.map((unit) =>
              unitKey(
                unit.contentHash,
                unit.problemNumber,
                unit.subproblemLetter,
              ),
            ),
          )
          for (const unit of serverUnits) {
            const key = unitKey(
              unit.contentHash,
              unit.problemNumber,
              unit.subproblemLetter,
            )
            if (!keptKeys.has(key)) kept.push(unit)
          }
          next[occasion._id] = kept
          continue
        }
        next[occasion._id] = serverUnits
      }
      return next
    })
  }, [occasions, dirtyOccasionIds])

  const unassigned = useMemo(() => {
    if (units === undefined) return []
    return units.filter((unit) => unit.occasionId === null)
  }, [units])

  const unassignedPdfOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const unit of unassigned) {
      if (!seen.has(unit.fileId)) {
        seen.set(unit.fileId, unit.fileName)
      }
    }
    return [...seen.entries()].map(([fileId, fileName]) => ({
      fileId,
      fileName,
    }))
  }, [unassigned])

  const filteredUnassigned = useMemo(() => {
    if (unassignedPdfFilter === ALL_PDFS_VALUE) return unassigned
    return unassigned.filter((unit) => unit.fileId === unassignedPdfFilter)
  }, [unassigned, unassignedPdfFilter])

  useEffect(() => {
    if (unassignedPdfFilter === ALL_PDFS_VALUE) return
    if (unassignedPdfOptions.some((option) => option.fileId === unassignedPdfFilter)) {
      return
    }
    setUnassignedPdfFilter(ALL_PDFS_VALUE)
  }, [unassignedPdfFilter, unassignedPdfOptions])

  useEffect(() => {
    if (units === undefined) return
    setSelectedOrder((prev) => {
      if (prev.length === 0) return prev
      const valid = new Set(unitByKey.keys())
      const next = prev.filter((key) => valid.has(key))
      return next.length === prev.length ? prev : next
    })
  }, [units, unitByKey])

  function toggleSelected(key: UnitKey, selected: boolean) {
    setBulkError(null)
    setSelectedOrder((prev) => {
      if (selected) {
        if (prev.includes(key)) return prev
        return [...prev, key]
      }
      return prev.filter((existing) => existing !== key)
    })
  }

  function setGroupSelected(keys: Array<UnitKey>, selected: boolean) {
    setBulkError(null)
    setSelectedOrder((prev) => {
      if (selected) {
        const existing = new Set(prev)
        const next = [...prev]
        for (const key of keys) {
          if (!existing.has(key)) {
            next.push(key)
            existing.add(key)
          }
        }
        return next
      }
      const remove = new Set(keys)
      return prev.filter((key) => !remove.has(key))
    })
  }

  function clearSelection() {
    setSelectedOrder([])
    setBulkStars(0)
    setBulkOccasionId(null)
    setBulkError(null)
    setDragFromIndex(null)
    setDragOverIndex(null)
  }

  function reorderSelected(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return
    setSelectedOrder((prev) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex >= prev.length
      ) {
        return prev
      }
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      if (moved === undefined) return prev
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  async function handleBulkAssign() {
    if (
      bulkStars !== 1 &&
      bulkStars !== 2 &&
      bulkStars !== 3
    ) {
      return
    }
    if (bulkOccasionId === null || selectedOrder.length === 0) {
      return
    }
    const stars = bulkStars
    const occasionId = bulkOccasionId as Id<"roomOccasions">
    const payload: Array<{
      problemId: Id<"problems">
      subproblemLetter?: string
    }> = []
    for (const key of selectedOrder) {
      const unit = unitByKey.get(key)
      if (unit === undefined) continue
      payload.push({
        problemId: unit.problemId,
        subproblemLetter:
          unit.subproblemLetter === "" ? undefined : unit.subproblemLetter,
      })
    }
    if (payload.length === 0) return

    setBulkPending(true)
    setBulkError(null)
    try {
      await assignUnits({
        roomId,
        units: payload,
        stars,
        occasionId,
      })
      clearSelection()
    } catch (err: unknown) {
      setBulkError(
        err instanceof Error ? err.message : "Kunde inte tilldela uppgifterna",
      )
    } finally {
      setBulkPending(false)
    }
  }

  function move(occasionId: string, index: number, direction: -1 | 1) {
    setErrorByOccasion((prev) => {
      const next = { ...prev }
      delete next[occasionId]
      return next
    })
    setSavedOccasionId(null)
    setOrderedByOccasion((prev) => {
      const current = prev?.[occasionId] ?? []
      const target = index + direction
      if (target < 0 || target >= current.length) return prev
      const nextList = [...current]
      const tmp = nextList[index]!
      nextList[index] = nextList[target]!
      nextList[target] = tmp
      return { ...(prev ?? {}), [occasionId]: nextList }
    })
    setDirtyOccasionIds((prev) => new Set(prev).add(occasionId))
  }

  async function handleStarsChange(
    problemId: Id<"problems">,
    letter: string,
    stars: ProblemStars,
  ) {
    await setStars({
      roomId,
      problemId,
      stars,
      subproblemLetter: letter === "" ? undefined : letter,
    })
  }

  async function handleOccasionChange(
    problemId: Id<"problems">,
    letter: string,
    occasionId: string | null,
  ) {
    await setForProblem({
      roomId,
      problemId,
      occasionId:
        occasionId === null ? null : (occasionId as Id<"roomOccasions">),
      subproblemLetter: letter === "" ? undefined : letter,
    })
  }

  function renderSelectAllControl(args: {
    keys: Array<UnitKey>
    label: string
    className?: string
  }) {
    if (args.keys.length === 0) return null
    const selectedCount = args.keys.filter((key) => selectedKeys.has(key)).length
    const allSelected = selectedCount === args.keys.length
    const someSelected = selectedCount > 0 && !allSelected
    return (
      <label
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground",
          args.className,
        )}
        onClick={(e) => {
          // Avoid double-toggle when nested in a clickable row.
          e.stopPropagation()
        }}
      >
        <input
          type="checkbox"
          className="size-3.5 rounded border-border"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = someSelected
          }}
          onChange={(e) => {
            setGroupSelected(args.keys, e.target.checked)
          }}
          aria-label={args.label}
        />
        <span className="sr-only">{args.label}</span>
      </label>
    )
  }

  function renderUnitRow(args: {
    key: string
    label: string
    fileName?: string | null
    problemId: Id<"problems">
    letter: string
    stars: ProblemStars
    occasionId: string | null
    selectable?: boolean
    reorder?: {
      occasionId: string
      index: number
      total: number
      pending: boolean
    }
  }) {
    const selected = selectedKeys.has(args.key)
    return (
      <li
        key={args.key}
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-md px-1 py-1.5 text-sm",
          args.selectable && "cursor-pointer hover:bg-muted/40",
          selected && "bg-muted/60 hover:bg-muted/60",
        )}
        onClick={
          args.selectable
            ? () => {
                toggleSelected(args.key, !selected)
              }
            : undefined
        }
      >
        {args.selectable ? (
          <input
            type="checkbox"
            className="size-3.5 shrink-0 rounded border-border"
            checked={selected}
            onClick={(e) => {
              e.stopPropagation()
            }}
            onChange={(e) => {
              toggleSelected(args.key, e.target.checked)
            }}
            aria-label={`Välj ${args.label}`}
          />
        ) : null}
        {args.reorder ? (
          <span className="w-5 shrink-0 tabular-nums text-muted-foreground">
            {args.reorder.index + 1}.
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{args.label}</div>
          {args.fileName ? (
            <div className="truncate text-xs text-muted-foreground">
              {args.fileName}
            </div>
          ) : null}
        </div>
        <div
          className="flex flex-wrap items-center gap-2"
          onClick={(e) => {
            e.stopPropagation()
          }}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="size-7 shrink-0 px-0"
            title="Visa tolkad eller PDF"
            onClick={() => {
              openPreview(args.problemId, "parsed")
            }}
          >
            <Eye className="size-3.5" />
            <span className="sr-only">Visa {args.label}</span>
          </Button>
          <ProblemStarsControl
            stars={args.stars}
            letter={args.letter}
            hideLetter
            onChange={(stars) => {
              void handleStarsChange(args.problemId, args.letter, stars)
            }}
          />
          <ProblemOccasionControl
            occasionId={args.occasionId}
            options={occasionOptions}
            letter={args.letter}
            onChange={(next) => {
              void handleOccasionChange(args.problemId, args.letter, next)
            }}
          />
        </div>
        {args.reorder ? (
          <span
            className="inline-flex shrink-0 items-center"
            onClick={(e) => {
              e.stopPropagation()
            }}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="size-7 shrink-0 px-0"
              disabled={args.reorder.pending || args.reorder.index === 0}
              title="Flytta upp"
              onClick={() => {
                move(args.reorder!.occasionId, args.reorder!.index, -1)
              }}
            >
              <ArrowUp className="size-3.5" />
              <span className="sr-only">Flytta upp</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="size-7 shrink-0 px-0"
              disabled={
                args.reorder.pending ||
                args.reorder.index === args.reorder.total - 1
              }
              title="Flytta ner"
              onClick={() => {
                move(args.reorder!.occasionId, args.reorder!.index, 1)
              }}
            >
              <ArrowDown className="size-3.5" />
              <span className="sr-only">Flytta ner</span>
            </Button>
          </span>
        ) : null}
      </li>
    )
  }

  function renderProblemGroupedUnits(units: Array<AssignableUnit>) {
    return groupUnitsByProblem(units).map((group) => {
      const groupKeys = group.units.map((unit) =>
        unitKey(unit.contentHash, unit.problemNumber, unit.subproblemLetter),
      )
      const rows = group.units.map((unit) =>
        renderUnitRow({
          key: unitKey(
            unit.contentHash,
            unit.problemNumber,
            unit.subproblemLetter,
          ),
          label: unit.label,
          problemId: unit.problemId,
          letter: unit.subproblemLetter,
          stars: starsForLetter(unit.starEntries, unit.subproblemLetter),
          occasionId: null,
          selectable: true,
        }),
      )

      if (group.units.length === 1) {
        return (
          <ul key={group.key} className="space-y-0.5">
            {rows}
          </ul>
        )
      }

      const selectedCount = groupKeys.filter((key) =>
        selectedKeys.has(key),
      ).length
      const allSelected = selectedCount === groupKeys.length

      return (
        <div key={group.key} className="space-y-0.5">
          <div
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-1 hover:bg-muted/40",
              allSelected && "bg-muted/40",
            )}
            onClick={() => {
              setGroupSelected(groupKeys, !allSelected)
            }}
          >
            {renderSelectAllControl({
              keys: groupKeys,
              label: `Markera alla deluppgifter för ${group.problemNumber}`,
            })}
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium tabular-nums text-muted-foreground">
              {group.problemNumber}
              <span className="ml-1.5 font-normal normal-case tracking-normal">
                alla deluppgifter ({group.units.length})
              </span>
            </span>
          </div>
          <ul className="ml-1 space-y-0.5 border-l border-border pl-1">
            {rows}
          </ul>
        </div>
      )
    })
  }

  if (occasions === undefined || units === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Stjärnor och tillfällen</CardTitle>
          <CardDescription>
            Tilldela stjärnor och tillfällen, och sortera uppgifter inom varje
            tillfälle.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Hämtar…</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stjärnor och tillfällen</CardTitle>
        <CardDescription>
          Markera uppgifter (hela raden), ordna dem mellan tillfällen och
          otilldelade, och tilldela stjärnor och tillfälle. Ordningen inom ett
          tillfälle styr listan under Tillfällen. Skapa tillfällen under
          Allmänt.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {units.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Inga tolkade uppgifter ännu. Tolka en PDF under Filer.
          </p>
        ) : null}

        {occasions.map((occasion) => {
          const ordered =
            orderedByOccasion?.[occasion._id] ??
            occasion.assignments.map((assignment) => ({
              contentHash: assignment.contentHash,
              problemNumber: assignment.problemNumber,
              subproblemLetter: assignment.subproblemLetter,
            }))
          const dirty = dirtyOccasionIds.has(occasion._id)
          const pending = pendingOccasionId === occasion._id
          const error = errorByOccasion[occasion._id]
          const occasionSelectableKeys = ordered
            .map((row) =>
              unitKey(
                row.contentHash,
                row.problemNumber,
                row.subproblemLetter,
              ),
            )
            .filter((key) => unitByKey.has(key))
          return (
            <section key={occasion._id} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {renderSelectAllControl({
                    keys: occasionSelectableKeys,
                    label: `Markera alla i ${occasion.label}`,
                  })}
                  <h3 className="text-sm font-medium">{occasion.label}</h3>
                </div>
                <span className="text-xs text-muted-foreground">
                  {ordered.length} uppgift{ordered.length === 1 ? "" : "er"}
                </span>
              </div>
              {ordered.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Inga uppgifter tilldelade.
                </p>
              ) : (
                <ul className="space-y-1 rounded-md border border-border p-2">
                  {ordered.map((row, index) => {
                    const key = unitKey(
                      row.contentHash,
                      row.problemNumber,
                      row.subproblemLetter,
                    )
                    const unit = unitByKey.get(key)
                    const label =
                      unit?.label ??
                      (row.subproblemLetter
                        ? `${row.problemNumber}${row.subproblemLetter}`
                        : row.problemNumber)
                    const fileName = unit?.fileName ?? "—"
                    const stars = unit
                      ? starsForLetter(unit.starEntries, row.subproblemLetter)
                      : 0
                    if (unit === undefined) {
                      return (
                        <li
                          key={key}
                          className="rounded-md px-1 py-1.5 text-sm text-muted-foreground"
                        >
                          {label} (saknas i rummet)
                        </li>
                      )
                    }
                    return renderUnitRow({
                      key,
                      label,
                      fileName,
                      problemId: unit.problemId,
                      letter: row.subproblemLetter,
                      stars,
                      occasionId: occasion._id,
                      selectable: true,
                      reorder: {
                        occasionId: occasion._id,
                        index,
                        total: ordered.length,
                        pending,
                      },
                    })
                  })}
                </ul>
              )}
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
              {savedOccasionId === occasion._id && !dirty ? (
                <p className="text-sm text-muted-foreground">Sparat.</p>
              ) : null}
              {ordered.length > 0 ? (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending || !dirty}
                    onClick={() => {
                      setErrorByOccasion((prev) => {
                        const next = { ...prev }
                        delete next[occasion._id]
                        return next
                      })
                      setSavedOccasionId(null)
                      setPendingOccasionId(occasion._id)
                      void setAssignmentOrder({
                        roomId,
                        occasionId: occasion._id,
                        units: ordered.map((row) => ({
                          contentHash: row.contentHash,
                          problemNumber: row.problemNumber,
                          subproblemLetter: row.subproblemLetter,
                        })),
                      })
                        .then(() => {
                          setDirtyOccasionIds((prev) => {
                            const next = new Set(prev)
                            next.delete(occasion._id)
                            return next
                          })
                          setSavedOccasionId(occasion._id)
                        })
                        .catch((err: unknown) => {
                          setErrorByOccasion((prev) => ({
                            ...prev,
                            [occasion._id]:
                              err instanceof Error
                                ? err.message
                                : "Kunde inte spara ordningen",
                          }))
                        })
                        .finally(() => setPendingOccasionId(null))
                    }}
                  >
                    {pending ? "Sparar…" : "Spara ordning"}
                  </Button>
                </div>
              ) : null}
            </section>
          )
        })}

        {selectedOrder.length > 0 ? (
          <div className="sticky top-2 z-10 rounded-lg border border-border bg-card/95 p-3 shadow-md backdrop-blur supports-backdrop-filter:bg-card/90">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium tabular-nums">
                {selectedOrder.length} vald
                {selectedOrder.length === 1 ? "" : "a"}
              </span>
              <ProblemStarsControl
                stars={bulkStars}
                hideLetter
                onChange={setBulkStars}
              />
              <ProblemOccasionControl
                occasionId={bulkOccasionId}
                options={occasionOptions}
                disabled={occasions.length === 0}
                onChange={setBulkOccasionId}
              />
              <Button
                type="button"
                size="sm"
                disabled={
                  bulkPending ||
                  bulkStars === 0 ||
                  bulkOccasionId === null ||
                  occasions.length === 0
                }
                onClick={() => {
                  void handleBulkAssign()
                }}
              >
                {bulkPending ? "Tilldelar…" : "Tilldela"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={bulkPending}
                onClick={clearSelection}
              >
                Avmarkera
              </Button>
            </div>

            <div className="mt-3 space-y-1.5">
              <p className="text-xs text-muted-foreground">
                Dra för att ändra ordning innan tilldelning.
              </p>
              <ul className="max-h-96 space-y-1 overflow-y-auto">
                {selectedOrder.map((key, index) => {
                  const unit = unitByKey.get(key)
                  const label =
                    unit?.label ??
                    (unit
                      ? unit.subproblemLetter
                        ? `${unit.problemNumber}${unit.subproblemLetter}`
                        : unit.problemNumber
                      : "—")
                  const isDragging = dragFromIndex === index
                  const isDropTarget =
                    dragOverIndex === index &&
                    dragFromIndex !== null &&
                    dragFromIndex !== index
                  return (
                    <li
                      key={key}
                      draggable={!bulkPending}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move"
                        event.dataTransfer.setData("text/plain", key)
                        setDragFromIndex(index)
                        setDragOverIndex(index)
                      }}
                      onDragOver={(event) => {
                        event.preventDefault()
                        event.dataTransfer.dropEffect = "move"
                        if (dragFromIndex === null) return
                        if (dragOverIndex !== index) {
                          setDragOverIndex(index)
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault()
                        if (dragFromIndex !== null) {
                          reorderSelected(dragFromIndex, index)
                        }
                        setDragFromIndex(null)
                        setDragOverIndex(null)
                      }}
                      onDragEnd={() => {
                        setDragFromIndex(null)
                        setDragOverIndex(null)
                      }}
                      className={cn(
                        "flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-sm",
                        !bulkPending && "cursor-grab active:cursor-grabbing",
                        isDragging && "opacity-50",
                        isDropTarget && "border-foreground/40 bg-muted/50",
                      )}
                    >
                      <GripVertical
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <span className="w-5 shrink-0 tabular-nums text-muted-foreground">
                        {index + 1}.
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {label}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="size-7 shrink-0 px-0"
                        disabled={bulkPending}
                        title="Ta bort från urval"
                        onClick={() => {
                          toggleSelected(key, false)
                        }}
                      >
                        <X className="size-3.5" />
                        <span className="sr-only">Ta bort från urval</span>
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </div>

            {bulkStars === 0 || bulkOccasionId === null ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Välj stjärnnivå och tillfälle, sedan Tilldela.
              </p>
            ) : null}
            {bulkError ? (
              <p className="mt-2 text-sm text-destructive">{bulkError}</p>
            ) : null}
          </div>
        ) : null}

        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {renderSelectAllControl({
                keys: filteredUnassigned.map((unit) =>
                  unitKey(
                    unit.contentHash,
                    unit.problemNumber,
                    unit.subproblemLetter,
                  ),
                ),
                label: "Markera alla otilldelade",
              })}
              <h3 className="text-sm font-medium">Otilldelad</h3>
            </div>
            <span className="text-xs text-muted-foreground">
              {filteredUnassigned.length}
              {unassignedPdfFilter !== ALL_PDFS_VALUE
                ? ` av ${unassigned.length}`
                : ""}{" "}
              uppgift
              {filteredUnassigned.length === 1 ? "" : "er"}
            </span>
          </div>
          {occasions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Skapa tillfällen under Allmänt för att kunna tilldela uppgifter.
            </p>
          ) : null}
          {unassigned.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Alla uppgifter är tilldelade.
            </p>
          ) : (
            <div className="space-y-3">
              {unassignedPdfOptions.length > 1 ? (
                <Select
                  value={unassignedPdfFilter}
                  items={{
                    [ALL_PDFS_VALUE]: "Alla PDF:er",
                    ...Object.fromEntries(
                      unassignedPdfOptions.map((option) => [
                        option.fileId,
                        option.fileName,
                      ]),
                    ),
                  }}
                  onValueChange={(value) => {
                    if (value == null) return
                    setUnassignedPdfFilter(value)
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    className="w-full max-w-sm"
                    aria-label="Filtrera otilldelade efter PDF"
                  >
                    <SelectValue placeholder="Välj PDF" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_PDFS_VALUE}>Alla PDF:er</SelectItem>
                    {unassignedPdfOptions.map((option) => (
                      <SelectItem key={option.fileId} value={option.fileId}>
                        {option.fileName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              {filteredUnassigned.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Inga otilldelade uppgifter i den här PDF:en.
                </p>
              ) : (
                <div className="space-y-2 rounded-md border border-border p-2">
                  {(unassignedPdfFilter === ALL_PDFS_VALUE
                    ? groupUnitsByPdf(filteredUnassigned)
                    : [
                        {
                          fileId: filteredUnassigned[0]!
                            .fileId,
                          fileName: filteredUnassigned[0]!.fileName,
                          units: filteredUnassigned,
                        },
                      ]
                  ).map((pdfGroup) => {
                    const pdfKey = `pdf:${pdfGroup.fileId}`
                    const showPdfHeader =
                      unassignedPdfFilter === ALL_PDFS_VALUE &&
                      unassignedPdfOptions.length > 1
                    const chapterBuckets = bucketUnitsByChapter(pdfGroup.units)
                    const pdfCollapsed = collapsedSections[pdfKey] === true

                    const chapterTree = (
                      <div
                        className={cn(
                          "flex flex-col gap-0.5",
                          showPdfHeader && "ml-1 border-l border-border pl-1",
                        )}
                      >
                        {chapterBuckets.map((bucket) => {
                          if (bucket.major === null || bucket.label === null) {
                            return (
                              <div
                                key={`${pdfGroup.fileId}:flat`}
                                className="space-y-0.5"
                              >
                                {renderProblemGroupedUnits(bucket.units)}
                              </div>
                            )
                          }

                          const chapterKey = `pdf:${pdfGroup.fileId}:ch:${bucket.major}`
                          const chapterCollapsed =
                            collapsedSections[chapterKey] === true
                          const chapterKeys = bucket.units.map((unit) =>
                            unitKey(
                              unit.contentHash,
                              unit.problemNumber,
                              unit.subproblemLetter,
                            ),
                          )
                          return (
                            <Collapsible
                              key={chapterKey}
                              open={!chapterCollapsed}
                              onOpenChange={(open) =>
                                setCollapsedSections((prev) => ({
                                  ...prev,
                                  [chapterKey]: !open,
                                }))
                              }
                            >
                              <div className="flex items-center gap-1">
                                {renderSelectAllControl({
                                  keys: chapterKeys,
                                  label: `Markera kapitel ${bucket.label}`,
                                })}
                                <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 py-1 text-left text-[11px] font-medium tracking-wide text-muted-foreground uppercase transition-colors hover:bg-muted/50 hover:text-foreground">
                                  <ChevronDown
                                    className={cn(
                                      "size-3 shrink-0 transition-transform",
                                      chapterCollapsed && "-rotate-90",
                                    )}
                                  />
                                  <span className="min-w-0 flex-1 truncate normal-case tabular-nums">
                                    {bucket.label}
                                  </span>
                                  <span className="shrink-0 text-[10px] font-medium normal-case tabular-nums text-muted-foreground">
                                    {bucket.units.length}
                                  </span>
                                </CollapsibleTrigger>
                              </div>
                              <CollapsibleContent>
                                <div className="mt-0.5 ml-1 space-y-0.5 border-l border-border pl-1">
                                  {renderProblemGroupedUnits(bucket.units)}
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          )
                        })}
                      </div>
                    )

                    if (!showPdfHeader) {
                      return (
                        <div key={pdfGroup.fileId}>{chapterTree}</div>
                      )
                    }

                    const pdfKeys = pdfGroup.units.map((unit) =>
                      unitKey(
                        unit.contentHash,
                        unit.problemNumber,
                        unit.subproblemLetter,
                      ),
                    )

                    return (
                      <Collapsible
                        key={pdfGroup.fileId}
                        open={!pdfCollapsed}
                        onOpenChange={(open) =>
                          setCollapsedSections((prev) => ({
                            ...prev,
                            [pdfKey]: !open,
                          }))
                        }
                      >
                        <div className="flex items-center gap-1">
                          {renderSelectAllControl({
                            keys: pdfKeys,
                            label: `Markera alla i ${pdfGroup.fileName}`,
                          })}
                          <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 py-1.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase transition-colors hover:bg-muted/50 hover:text-foreground">
                            <ChevronDown
                              className={cn(
                                "size-3.5 shrink-0 transition-transform",
                                pdfCollapsed && "-rotate-90",
                              )}
                            />
                            <span className="min-w-0 flex-1 truncate normal-case">
                              {pdfGroup.fileName}
                            </span>
                            <span className="shrink-0 text-[10px] font-medium normal-case tabular-nums">
                              {pdfGroup.units.length}
                            </span>
                          </CollapsibleTrigger>
                        </div>
                        <CollapsibleContent>{chapterTree}</CollapsibleContent>
                      </Collapsible>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      </CardContent>

      <ProblemAssignmentPreviewSheet
        roomId={roomId}
        problemId={previewProblemId}
        open={previewProblemId !== null}
        initialTab={previewTab}
        onOpenChange={(open) => {
          if (!open) setPreviewProblemId(null)
        }}
      />
    </Card>
  )
}
