import type { LumoStaticPart } from "~/lib/lumo-content"
import { StaticMath } from "~/components/lumo/static-math"
import { cn } from "~/lib/utils"

type StaticLumoPartsProps = {
  parts: Array<LumoStaticPart>
  className?: string
}

type ContentPart = Exclude<
  LumoStaticPart,
  { type: "subproblem" } | { type: "case" }
>

type Segment =
  | { kind: "intro"; parts: Array<ContentPart> }
  | {
      kind: "subproblem"
      label: string
      parts: Array<ContentPart>
    }
  | {
      kind: "case"
      label: string | undefined
      parts: Array<ContentPart>
      index: number
    }

function groupParts(parts: Array<LumoStaticPart>): Array<Segment> {
  const segments: Array<Segment> = []
  let current: Segment = { kind: "intro", parts: [] }
  let caseIndex = 0

  for (const part of parts) {
    if (part.type === "subproblem") {
      if (!(current.kind === "intro" && current.parts.length === 0)) {
        segments.push(current)
      }
      current = { kind: "subproblem", label: part.label, parts: [] }
      continue
    }
    if (part.type === "case") {
      if (!(current.kind === "intro" && current.parts.length === 0)) {
        segments.push(current)
      }
      caseIndex += 1
      current = {
        kind: "case",
        label: part.label,
        parts: [],
        index: caseIndex,
      }
      continue
    }
    current.parts.push(part)
  }

  if (current.kind === "intro" ? current.parts.length > 0 : true) {
    segments.push(current)
  }

  return segments
}

function PartCaption({ caption }: { caption: string }) {
  return (
    <span className="mr-1 font-medium text-muted-foreground">{caption} =</span>
  )
}

function InlineParts({ parts }: { parts: Array<ContentPart> }) {
  return (
    <span className="leading-relaxed">
      {parts.map((part, index) => {
        const prev = parts[index - 1]
        const needsSep =
          index > 0 &&
          !part.caption &&
          prev !== undefined &&
          !prev.caption &&
          prev.type === "latex" &&
          part.type === "latex"

        if (part.type === "text") {
          return (
            <span key={index} className="whitespace-pre-wrap">
              {needsSep ? "; " : index > 0 && !part.caption ? " " : ""}
              {part.caption ? <PartCaption caption={part.caption} /> : null}
              {part.content}
            </span>
          )
        }

        return (
          <span key={index} className="inline">
            {needsSep ? "; " : index > 0 && !part.caption ? " " : ""}
            {part.caption ? <PartCaption caption={part.caption} /> : null}
            <StaticMath
              latex={part.content}
              display={part.display ?? "inline"}
              className={
                part.display === "block"
                  ? "my-1"
                  : "mx-0.5 align-middle border-0 bg-transparent p-0 shadow-none"
              }
            />
          </span>
        )
      })}
    </span>
  )
}

export function StaticLumoParts({ parts, className }: StaticLumoPartsProps) {
  if (parts.length === 0) {
    return (
      <p className={cn("text-sm italic text-muted-foreground", className)}>
        (tomt)
      </p>
    )
  }

  const segments = groupParts(parts)

  return (
    <div className={cn("flex flex-col gap-2 text-base", className)}>
      {segments.map((segment, index) => {
        if (segment.kind === "intro") {
          return <InlineParts key={`intro-${index}`} parts={segment.parts} />
        }
        if (segment.kind === "subproblem") {
          return (
            <div key={`sub-${segment.label}-${index}`} className="flex gap-2">
              <span className="shrink-0 font-semibold tabular-nums text-foreground">
                {segment.label})
              </span>
              <InlineParts parts={segment.parts} />
            </div>
          )
        }
        const caseLabel =
          segment.label && segment.label.length > 0
            ? segment.label
            : String(segment.index)
        return (
          <div
            key={`case-${caseLabel}-${index}`}
            className="flex gap-2 border-l-2 border-muted-foreground/30 pl-3"
          >
            <span className="shrink-0 text-sm font-medium text-muted-foreground">
              Fall {caseLabel}
            </span>
            <InlineParts parts={segment.parts} />
          </div>
        )
      })}
    </div>
  )
}
