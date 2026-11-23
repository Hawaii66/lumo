import { describe, expect, it } from "vitest"
import {
  findNextIncompleteProblem,
  hasAssignableProblems,
} from "./next-incomplete-problem"

describe("findNextIncompleteProblem", () => {
  const occasions = [
    {
      _id: "occ1",
      label: "Lektion 1 (1/1)",
      assignments: [
        {
          contentHash: "h1",
          problemNumber: "1",
          subproblemLetter: "a",
          problemId: "p1a",
          label: "1a",
        },
        {
          contentHash: "h1",
          problemNumber: "1",
          subproblemLetter: "b",
          problemId: "p1b",
          label: "1b",
        },
      ],
    },
    {
      _id: "occ2",
      label: "Lektion 2 (2/1)",
      assignments: [
        {
          contentHash: "h2",
          problemNumber: "2",
          subproblemLetter: "",
          problemId: "p2",
          label: "2",
        },
      ],
    },
  ]

  it("returns the first incomplete unit in order", () => {
    expect(
      findNextIncompleteProblem(occasions, [
        {
          contentHash: "h1",
          problemNumber: "1",
          subproblemLetter: "a",
          completionEntries: [{ letter: "a" }],
        },
        {
          contentHash: "h1",
          problemNumber: "1",
          subproblemLetter: "b",
          completionEntries: [],
        },
        {
          contentHash: "h2",
          problemNumber: "2",
          subproblemLetter: "",
          completionEntries: [],
        },
      ]),
    ).toEqual({
      problemId: "p1b",
      label: "1b",
      occasionLabel: "Lektion 1 (1/1)",
    })
  })

  it("skips assignments without a problemId", () => {
    expect(
      findNextIncompleteProblem(
        [
          {
            label: "Lektion 1 (1/1)",
            assignments: [
              {
                contentHash: "h1",
                problemNumber: "1",
                subproblemLetter: "",
                problemId: null,
                label: "1",
              },
              {
                contentHash: "h2",
                problemNumber: "2",
                subproblemLetter: "",
                problemId: "p2",
                label: "2",
              },
            ],
          },
        ],
        [
          {
            contentHash: "h2",
            problemNumber: "2",
            subproblemLetter: "",
            completionEntries: [],
          },
        ],
      ),
    ).toEqual({
      problemId: "p2",
      label: "2",
      occasionLabel: "Lektion 1 (1/1)",
    })
  })

  it("returns null when everything assigned is complete", () => {
    expect(
      findNextIncompleteProblem(occasions, [
        {
          contentHash: "h1",
          problemNumber: "1",
          subproblemLetter: "a",
          completionEntries: [{ letter: "a" }],
        },
        {
          contentHash: "h1",
          problemNumber: "1",
          subproblemLetter: "b",
          completionEntries: [{ letter: "b" }],
        },
        {
          contentHash: "h2",
          problemNumber: "2",
          subproblemLetter: "",
          completionEntries: [{ letter: "" }],
        },
      ]),
    ).toBeNull()
  })
})

describe("hasAssignableProblems", () => {
  it("is false when no resolvable problem ids exist", () => {
    expect(
      hasAssignableProblems([
        {
          label: "Lektion 1 (1/1)",
          assignments: [
            {
              contentHash: "h1",
              problemNumber: "1",
              subproblemLetter: "",
              problemId: null,
              label: "1",
            },
          ],
        },
      ]),
    ).toBe(false)
  })

  it("is true when at least one problem id exists", () => {
    expect(
      hasAssignableProblems([
        {
          label: "Lektion 1 (1/1)",
          assignments: [
            {
              contentHash: "h1",
              problemNumber: "1",
              subproblemLetter: "",
              problemId: "p1",
              label: "1",
            },
          ],
        },
      ]),
    ).toBe(true)
  })
})
