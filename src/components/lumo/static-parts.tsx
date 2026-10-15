import type { LumoStaticPart } from "~/lib/lumo-content"
import { StaticMath } from "~/components/lumo/static-math"
import { cn } from "~/lib/utils"

type StaticLumoPartsProps = {
  parts: Array<LumoStaticPart>
  className?: string
}

type Segment =
  | { kind: "intro"; parts: Array<Exclude<LumoStaticPart, { type: "subproblem" }>> }
  | {
      kind: "subproblem"
      label: string
      parts: Array<Exclude<LumoStaticPart, { type: "subproblem" }>>
    }

function groupParts(parts: Array<LumoStaticPart>): Array<Segment> {
  const segments: Array<Segment> = []
  let current: Segment = { kind: "intro", parts: [] }

  for (const part of parts) {
    if (part.type === "subproblem") {
      if (current.kind === "intro" && current.parts.length === 0) {
        // skip empty intro
      } else {
        segments.push(current)
      }
      current = { kind: "subproblem", label: part.label, parts: [] }
      continue
    }
    current.parts.push(part)
  }

  if (current.kind === "intro" ? current.parts.length > 0 : true) {
    segments.push(current)
  }

  return segments
}

function InlineParts({
  parts,
}: {
  parts: Array<Exclude<LumoStaticPart, { type: "subproblem" }>>
}) {
  return (
    <span className="leading-relaxed">
      {parts.map((part, index) => {
        if (part.type === "text") {
          return (
            <span key={index} className="whitespace-pre-wrap">
              {part.content}
              {index < parts.length - 1 ? " " : ""}
            </span>
          )
        }
        return (
          <StaticMath
            key={index}
            latex={part.content}
            display={part.display ?? "inline"}
            className={
              part.display === "block"
                ? "my-1"
                : "mx-0.5 align-middle border-0 bg-transparent p-0 shadow-none"
            }
          />
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
        return (
          <div key={`sub-${segment.label}-${index}`} className="flex gap-2">
            <span className="shrink-0 font-semibold tabular-nums text-foreground">
              {segment.label})
            </span>
            <InlineParts parts={segment.parts} />
          </div>
        )
      })}
    </div>
  )
}
