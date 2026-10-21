import type { ReactNode } from "react"
import { StaticMath } from "~/components/lumo/static-math"
import {
  CITATION_RE,
  PROBLEM_MENTION_RE,
  splitTextWithInlineMath,
} from "~/lib/chat-composer"
import { cn } from "~/lib/utils"

type UserMessageTextProps = {
  text: string
  className?: string
}

/** Highlight `@mentions` and quoted citations in bold primary. */
function renderHighlightedPlainText(text: string, keyPrefix: string): ReactNode {
  const ranges: Array<{ start: number; end: number }> = []
  for (const match of text.matchAll(PROBLEM_MENTION_RE)) {
    if (match.index === undefined) continue
    ranges.push({ start: match.index, end: match.index + match[0].length })
  }
  for (const match of text.matchAll(CITATION_RE)) {
    if (match.index === undefined) continue
    ranges.push({ start: match.index, end: match.index + match[0].length })
  }
  ranges.sort((a, b) => a.start - b.start || a.end - b.end)

  const merged: Array<{ start: number; end: number }> = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (last && range.start < last.end) {
      last.end = Math.max(last.end, range.end)
      continue
    }
    merged.push({ ...range })
  }

  if (merged.length === 0) return text

  const nodes: Array<ReactNode> = []
  let cursor = 0
  for (const range of merged) {
    if (range.start > cursor) {
      nodes.push(text.slice(cursor, range.start))
    }
    nodes.push(
      <span
        key={`${keyPrefix}-${range.start}`}
        className="rounded-sm bg-primary-foreground/20 px-0.5 font-bold"
      >
        {text.slice(range.start, range.end)}
      </span>,
    )
    cursor = range.end
  }
  if (cursor < text.length) {
    nodes.push(text.slice(cursor))
  }
  return nodes
}

/** Render user prompt text with `$latex$` segments as MathLive. */
export function UserMessageText({ text, className }: UserMessageTextProps) {
  const segments = splitTextWithInlineMath(text)

  return (
    <div className={cn("whitespace-pre-wrap", className)}>
      {segments.map((segment, index) => {
        if (segment.type === "math") {
          return (
            <StaticMath
              key={`math-${index}`}
              latex={segment.value}
              display="block"
              className="my-1 rounded-md bg-background/15 px-2 py-1 text-inherit"
            />
          )
        }
        if (!segment.value) return null
        return (
          <span key={`text-${index}`}>
            {renderHighlightedPlainText(segment.value, `t${index}`)}
          </span>
        )
      })}
    </div>
  )
}
