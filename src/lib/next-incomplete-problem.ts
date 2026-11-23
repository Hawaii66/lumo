import { isCompletedForLetter } from "~/components/rooms/problem-completion"
import { unitKey } from "~/lib/occasion-label"

export type NextIncompleteAssignment = {
  contentHash: string
  problemNumber: string
  subproblemLetter: string
  problemId: string | null
  label: string
}

export type NextIncompleteOccasion = {
  _id: string
  label: string
  assignments: Array<NextIncompleteAssignment>
}

export type NextIncompleteUnit = {
  problemId: string
  label: string
  occasionId: string
  occasionLabel: string
}

export type NextIncompleteUnitSource = {
  contentHash: string
  problemNumber: string
  subproblemLetter: string
  completionEntries: Array<{ letter: string }>
}

/**
 * First incomplete assigned unit in tillfälle order, then assignment order.
 * Skips assignments whose problemId is missing.
 */
export function findNextIncompleteProblem(
  occasions: Array<NextIncompleteOccasion>,
  units: Array<NextIncompleteUnitSource>,
): NextIncompleteUnit | null {
  const unitByKey = new Map(
    units.map((unit) => [
      unitKey(unit.contentHash, unit.problemNumber, unit.subproblemLetter),
      unit,
    ] as const),
  )

  for (const occasion of occasions) {
    for (const assignment of occasion.assignments) {
      if (assignment.problemId === null) continue
      const key = unitKey(
        assignment.contentHash,
        assignment.problemNumber,
        assignment.subproblemLetter,
      )
      const unit = unitByKey.get(key)
      const completionEntries = unit?.completionEntries ?? []
      if (
        isCompletedForLetter(completionEntries, assignment.subproblemLetter)
      ) {
        continue
      }
      return {
        problemId: assignment.problemId,
        label: assignment.label,
        occasionId: occasion._id,
        occasionLabel: occasion.label,
      }
    }
  }

  return null
}

/** True when at least one assignment with a resolvable problemId exists. */
export function hasAssignableProblems(
  occasions: Array<NextIncompleteOccasion>,
): boolean {
  return occasions.some((occasion) =>
    occasion.assignments.some((assignment) => assignment.problemId !== null),
  )
}
