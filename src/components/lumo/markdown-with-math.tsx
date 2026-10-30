import { Fragment, type ReactNode } from "react"
import { Highlighter } from "lucide-react"
import { StaticMath } from "~/components/lumo/static-math"
import { Button } from "~/components/ui/button"
import {
  isFallHeading,
  isSubproblemHeading,
  splitMarkdownMath,
  subproblemAnchorId,
} from "~/lib/markdown-math"
import { cn } from "~/lib/utils"

type MarkdownWithMathProps = {
  markdown: string
  /** Scope for subproblem anchor ids (message key / problem id). */
  scopeKey?: string
  onCiteMath?: (latex: string) => void
  className?: string
}

function InlineMd({ text }: { text: string }) {
  const pieces: Array<ReactNode> = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      pieces.push(<Fragment key={key++}>{text.slice(last, m.index)}</Fragment>)
    }
    const token = m[0]!
    if (token.startsWith("**")) {
      pieces.push(<strong key={key++}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith("*")) {
      pieces.push(<em key={key++}>{token.slice(1, -1)}</em>)
    } else {
      pieces.push(
        <code
          key={key++}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]"
        >
          {token.slice(1, -1)}
        </code>,
      )
    }
    last = m.index + token.length
  }
  if (last < text.length) {
    pieces.push(<Fragment key={key++}>{text.slice(last)}</Fragment>)
  }
  return <>{pieces}</>
}

function MathCite({
  latex,
  display,
  onCiteMath,
}: {
  latex: string
  display: "inline" | "block"
  onCiteMath?: (latex: string) => void
}) {
  const isInline = display === "inline"
  return (
    <span
      className={cn(
        "group/math gap-1",
        isInline
          ? "inline-flex max-w-full items-center"
          : "flex w-full items-start",
      )}
    >
      <span className={cn("min-w-0", isInline ? "inline-block" : "block flex-1")}>
        <StaticMath
          latex={latex}
          display={display}
          className={
            isInline
              ? "mx-0.5 align-middle border-0 bg-transparent p-0 shadow-none"
              : "my-1 border-0 bg-transparent p-0 shadow-none"
          }
        />
      </span>
      {!isInline && onCiteMath ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          data-cite-math-btn=""
          className={cn(
            "mt-1 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-primary",
            "group-hover/math:opacity-100 focus-visible:opacity-100",
          )}
          title="Citera formel"
          aria-label="Citera formel"
          onClick={() => onCiteMath(latex)}
        >
          <Highlighter />
        </Button>
      ) : null}
    </span>
  )
}

function renderRichInline(
  text: string,
  onCiteMath?: (latex: string) => void,
): ReactNode {
  return splitMarkdownMath(text).map((seg, i) => {
    if (seg.kind === "text") {
      return <InlineMd key={i} text={seg.content} />
    }
    return (
      <MathCite
        key={i}
        latex={seg.latex}
        display={seg.display}
        onCiteMath={onCiteMath}
      />
    )
  })
}

/** Compact inline markdown + `$` / `$$` for chips (e.g. quick replies). */
export function InlineMarkdownMath({
  markdown,
  className,
}: {
  markdown: string
  className?: string
}) {
  return (
    <span className={cn("inline leading-none", className)}>
      {renderRichInline(markdown)}
    </span>
  )
}

type Block =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: number; text: string }
  | { type: "subproblem"; label: string; chapterIndex: number }
  | { type: "fall"; n: string; condition: string }
  | { type: "list"; ordered: boolean; items: Array<string> }
  | { type: "blank" }

function parseBlocks(markdown: string): Array<Block> {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  const blocks: Array<Block> = []
  let i = 0
  let chapterIndex = 0

  while (i < lines.length) {
    const line = lines[i]!
    const trimmed = line.trim()

    if (trimmed.length === 0) {
      blocks.push({ type: "blank" })
      i += 1
      continue
    }

    const subLabel = isSubproblemHeading(trimmed)
    if (subLabel) {
      blocks.push({
        type: "subproblem",
        label: subLabel,
        chapterIndex: chapterIndex++,
      })
      i += 1
      continue
    }

    const fall = isFallHeading(trimmed)
    if (fall) {
      blocks.push({ type: "fall", n: fall.number, condition: fall.rest })
      i += 1
      continue
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1]!.length,
        text: heading[2]!,
      })
      i += 1
      continue
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/)
    const ordered = trimmed.match(/^\d+\.\s+(.+)$/)
    if (unordered || ordered) {
      const isOrdered = Boolean(ordered)
      const items: Array<string> = []
      while (i < lines.length) {
        const t = lines[i]!.trim()
        const u = t.match(/^[-*]\s+(.+)$/)
        const o = t.match(/^\d+\.\s+(.+)$/)
        if (isOrdered ? !o : !u) break
        items.push(isOrdered ? o![1]! : u![1]!)
        i += 1
      }
      blocks.push({ type: "list", ordered: isOrdered, items })
      continue
    }

    const para: Array<string> = [line]
    i += 1
    while (i < lines.length) {
      const next = lines[i]!
      const nt = next.trim()
      if (
        nt.length === 0 ||
        isSubproblemHeading(nt) ||
        isFallHeading(nt) ||
        /^(#{1,4})\s+/.test(nt) ||
        /^[-*]\s+/.test(nt) ||
        /^\d+\.\s+/.test(nt)
      ) {
        break
      }
      para.push(next)
      i += 1
    }
    blocks.push({ type: "paragraph", text: para.join("\n") })
  }

  return blocks
}

export function MarkdownWithMath({
  markdown,
  scopeKey,
  onCiteMath,
  className,
}: MarkdownWithMathProps) {
  if (markdown.trim().length === 0) {
    return (
      <p className={cn("text-sm italic text-muted-foreground", className)}>
        (tomt)
      </p>
    )
  }

  const blocks = parseBlocks(markdown)

  return (
    <div
      className={cn("flex flex-col gap-2 text-base leading-relaxed", className)}
    >
      {blocks.map((block, index) => {
        if (block.type === "blank") {
          return <div key={index} className="h-1" aria-hidden />
        }
        if (block.type === "subproblem") {
          return (
            <p
              key={index}
              id={
                scopeKey
                  ? subproblemAnchorId(scopeKey, block.chapterIndex)
                  : undefined
              }
              data-lumo-subproblem={block.label}
              className="scroll-mt-3 text-sm font-semibold text-muted-foreground"
            >
              ({block.label})
            </p>
          )
        }
        if (block.type === "fall") {
          return (
            <p
              key={index}
              className="border-l-2 border-muted-foreground/30 pl-3 text-sm font-medium text-muted-foreground"
            >
              Fall {block.n}
              {block.condition.length > 0 ? (
                <>
                  {": "}
                  {renderRichInline(block.condition, onCiteMath)}
                </>
              ) : null}
            </p>
          )
        }
        if (block.type === "heading") {
          const Tag = (
            block.level <= 2 ? "h3" : block.level === 3 ? "h4" : "h5"
          ) as "h3" | "h4" | "h5"
          return (
            <Tag key={index} className="text-sm font-semibold text-foreground">
              {renderRichInline(block.text, onCiteMath)}
            </Tag>
          )
        }
        if (block.type === "list") {
          const ListTag = block.ordered ? "ol" : "ul"
          return (
            <ListTag
              key={index}
              className={cn(
                "flex flex-col gap-1 pl-5",
                block.ordered ? "list-decimal" : "list-disc",
              )}
            >
              {block.items.map((item, j) => (
                <li key={j}>{renderRichInline(item, onCiteMath)}</li>
              ))}
            </ListTag>
          )
        }
        return (
          <p key={index} className="whitespace-pre-wrap">
            {renderRichInline(block.text, onCiteMath)}
          </p>
        )
      })}
    </div>
  )
}
