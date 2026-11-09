import {
  MAX_MERGE_INPUTS,
  MIN_MERGE_INPUTS,
} from "../../convex/lib/pdfMerge"

export type JoinCandidateFile = {
  id: string
  name: string
}

export type JoinGroupSuggestion = {
  /** Stable id for React keys, e.g. `date:2023-08-11`. */
  key: string
  /** Short Swedish label, e.g. `Datum 2023-08-11`. */
  label: string
  /** Human reason shown under the row. */
  reason: string
  /** Suggested merge filename base without `.pdf`. */
  nameBase: string
  fileIds: string[]
  fileNames: string[]
}

type DateMatch = {
  normalized: string
  compact: string
}

type PatternExtractor = {
  id: string
  extract: (stem: string) => DateMatch | null
  label: (match: DateMatch) => string
  reason: (match: DateMatch) => string
  nameBase: (match: DateMatch) => string
}

function isValidMonthDay(month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31
}

function expandYear(yyOrYyyy: string): string {
  if (yyOrYyyy.length === 4) return yyOrYyyy
  return `20${yyOrYyyy}`
}

function parseCompactDigits(digits: string): DateMatch | null {
  if (digits.length === 6) {
    const year = expandYear(digits.slice(0, 2))
    const month = Number(digits.slice(2, 4))
    const day = Number(digits.slice(4, 6))
    if (!isValidMonthDay(month, day)) return null
    return {
      normalized: `${year}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`,
      compact: digits,
    }
  }
  if (digits.length === 8) {
    const year = digits.slice(0, 4)
    const month = Number(digits.slice(4, 6))
    const day = Number(digits.slice(6, 8))
    if (!isValidMonthDay(month, day)) return null
    return {
      normalized: `${year}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`,
      compact: digits.slice(2),
    }
  }
  return null
}

function parseSeparatedDate(raw: string): DateMatch | null {
  const parts = raw.split("-")
  if (parts.length !== 3) return null
  const [yRaw, mRaw, dRaw] = parts
  if (
    yRaw === undefined ||
    mRaw === undefined ||
    dRaw === undefined ||
    !/^\d{2}$|^\d{4}$/.test(yRaw) ||
    !/^\d{2}$/.test(mRaw) ||
    !/^\d{2}$/.test(dRaw)
  ) {
    return null
  }
  const year = expandYear(yRaw)
  const month = Number(mRaw)
  const day = Number(dRaw)
  if (!isValidMonthDay(month, day)) return null
  return {
    normalized: `${year}-${mRaw}-${dRaw}`,
    compact: `${year.slice(2)}${mRaw}${dRaw}`,
  }
}

/**
 * Trailing date at end of stem: either the whole name, after `_`/`-`/space,
 * or glued to a non-digit prefix (e.g. L230111 / T230111).
 */
const TRAILING_DATE_RE =
  /(?<!\d)((?:\d{4}|\d{2})-\d{2}-\d{2}|\d{8}|\d{6})$/

const dateSuffixPattern: PatternExtractor = {
  id: "date",
  extract(stem) {
    const match = TRAILING_DATE_RE.exec(stem)
    if (!match?.[1]) return null
    const token = match[1]
    if (token.includes("-")) {
      return parseSeparatedDate(token)
    }
    return parseCompactDigits(token)
  },
  label(match) {
    return `Datum ${match.normalized}`
  },
  reason(match) {
    return `samma datum (${match.normalized})`
  },
  nameBase(match) {
    return `sammanslagen-${match.compact}`
  },
}

const patterns: PatternExtractor[] = [dateSuffixPattern]

function stripExtension(name: string): string {
  const lastDot = name.lastIndexOf(".")
  if (lastDot <= 0) return name
  return name.slice(0, lastDot)
}

/**
 * Group files that share a common join pattern (currently: trailing date).
 * Members are sorted by filename; groups smaller than minInputs are dropped.
 */
export function detectJoinGroups(
  files: JoinCandidateFile[],
  options?: {
    minInputs?: number
    maxInputs?: number
  },
): JoinGroupSuggestion[] {
  const minInputs = options?.minInputs ?? MIN_MERGE_INPUTS
  const maxInputs = options?.maxInputs ?? MAX_MERGE_INPUTS

  const suggestions: JoinGroupSuggestion[] = []

  for (const pattern of patterns) {
    const buckets = new Map<
      string,
      { match: DateMatch; members: JoinCandidateFile[] }
    >()

    for (const file of files) {
      const stem = stripExtension(file.name)
      const match = pattern.extract(stem)
      if (match === null) continue
      const existing = buckets.get(match.normalized)
      if (existing) {
        existing.members.push(file)
      } else {
        buckets.set(match.normalized, { match, members: [file] })
      }
    }

    for (const [normalized, bucket] of buckets) {
      if (bucket.members.length < minInputs) continue

      const sorted = [...bucket.members].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      )
      const capped = sorted.slice(0, maxInputs)

      suggestions.push({
        key: `${pattern.id}:${normalized}`,
        label: pattern.label(bucket.match),
        reason: pattern.reason(bucket.match),
        nameBase: pattern.nameBase(bucket.match),
        fileIds: capped.map((f) => f.id),
        fileNames: capped.map((f) => f.name),
      })
    }
  }

  return suggestions.sort((a, b) => a.label.localeCompare(b.label, "sv"))
}
