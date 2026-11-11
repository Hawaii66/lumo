import { Fragment, type ReactNode } from "react"
import { Highlighter } from "lucide-react"
import { StaticMath } from "~/components/lumo/static-math"
import { ProblemCompletionControl } from "~/components/rooms/problem-completion"
import {
  ProblemOccasionControl,
  ProblemOccasionReadonly,
  type ProblemOccasionOption,
} from "~/components/rooms/problem-occasion"
import {
  ProblemStarsControl,
  ProblemStarsReadonly,
  type ProblemStars,
} from "~/components/rooms/problem-stars"
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
  /** When set, star levels appear on deluppgift labels (editable if onChange). */
  subproblemStars?: {
    getStars: (letter: string) => ProblemStars
    onChange?: (letter: string, stars: ProblemStars) => void
  }
  /** When set, completion toggles appear on deluppgift labels. */
  subproblemCompletion?: {
    isCompleted: (letter: string) => boolean
    onChange: (letter: string, completed: boolean) => void
  }
  /** When set, tillfälle labels/pickers appear on deluppgift labels. */
  subproblemOccasion?: {
    options?: Array<ProblemOccasionOption>
    getOccasionId?: (letter: string) => string | null
    getOccasionLabel?: (letter: string) => string | null
    onChange?: (letter: string, occasionId: string | null) => void
  }
  /**
   * Images keyed by deluppgift letter (`""` = shared stem before first
   * subproblem). Rendered after each section's content.
   */
  imagesByLetter?: Record<string, Array<{ url: string }>>
  /** Optional renderer for a section's images (defaults to simple img list). */
  renderImages?: (
    images: Array<{ url: string }>,
    letter: string,
  ) => ReactNode
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

function DefaultSectionImages({
  images,
  letter,
}: {
  images: Array<{ url: string }>
  letter: string
}) {
  if (images.length === 0) return null
  const label =
    letter.length > 0 ? `Figur till (${letter})` : "Figur till ingressen"
  return (
    <ul className="grid gap-2 sm:grid-cols-2" aria-label={label}>
      {images.map((image, index) => (
        <li key={`${image.url}-${index}`}>
          <img
            src={image.url}
            alt={`${label} ${index + 1}`}
            className="max-h-64 w-full rounded-lg border border-border bg-muted/30 object-contain"
            loading="lazy"
          />
        </li>
      ))}
    </ul>
  )
}

export function MarkdownWithMath({
  markdown,
  scopeKey,
  onCiteMath,
  className,
  subproblemStars,
  subproblemCompletion,
  subproblemOccasion,
  imagesByLetter,
  renderImages,
}: MarkdownWithMathProps) {
  if (markdown.trim().length === 0) {
    return (
      <p className={cn("text-sm italic text-muted-foreground", className)}>
        (tomt)
      </p>
    )
  }

  const blocks = parseBlocks(markdown)
  const nodes: Array<ReactNode> = []
  let currentLetter = ""
  const flushedLetters = new Set<string>()

  const flushImages = (letter: string, key: string) => {
    if (flushedLetters.has(letter)) return
    flushedLetters.add(letter)
    const images = imagesByLetter?.[letter] ?? []
    if (images.length === 0) return
    nodes.push(
      <div key={key}>
        {renderImages ? (
          renderImages(images, letter)
        ) : (
          <DefaultSectionImages images={images} letter={letter} />
        )}
      </div>,
    )
  }

  blocks.forEach((block, index) => {
    if (block.type === "subproblem") {
      flushImages(currentLetter, `imgs-${currentLetter || "stem"}-${index}`)
      currentLetter = block.label.toLowerCase()
      const letter = currentLetter
      nodes.push(
        <div
          key={index}
          id={
            scopeKey
              ? subproblemAnchorId(scopeKey, block.chapterIndex)
              : undefined
          }
          data-lumo-subproblem={block.label}
          className="scroll-mt-3 flex items-center gap-1.5"
        >
          <p className="text-sm font-semibold text-muted-foreground">
            ({block.label})
          </p>
          {subproblemStars ? (
            subproblemStars.onChange ? (
              <ProblemStarsControl
                letter={letter}
                hideLetter
                stars={subproblemStars.getStars(letter)}
                onChange={(stars) => subproblemStars.onChange?.(letter, stars)}
              />
            ) : (
              <ProblemStarsReadonly
                letter={letter}
                hideLetter
                stars={subproblemStars.getStars(letter)}
              />
            )
          ) : null}
          {subproblemCompletion ? (
            <ProblemCompletionControl
              letter={letter}
              completed={subproblemCompletion.isCompleted(letter)}
              onChange={(completed) =>
                subproblemCompletion.onChange(letter, completed)
              }
            />
          ) : null}
          {subproblemOccasion ? (
            subproblemOccasion.onChange ? (
              <ProblemOccasionControl
                letter={letter}
                occasionId={
                  subproblemOccasion.getOccasionId?.(letter) ?? null
                }
                options={subproblemOccasion.options ?? []}
                onChange={(occasionId) =>
                  subproblemOccasion.onChange?.(letter, occasionId)
                }
              />
            ) : (
              <ProblemOccasionReadonly
                letter={letter}
                label={
                  subproblemOccasion.getOccasionLabel?.(letter) ?? null
                }
              />
            )
          ) : null}
        </div>,
      )
      return
    }

    if (block.type === "blank") {
      nodes.push(<div key={index} className="h-1" aria-hidden />)
      return
    }
    if (block.type === "fall") {
      nodes.push(
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
        </p>,
      )
      return
    }
    if (block.type === "heading") {
      const Tag = (
        block.level <= 2 ? "h3" : block.level === 3 ? "h4" : "h5"
      ) as "h3" | "h4" | "h5"
      nodes.push(
        <Tag key={index} className="text-sm font-semibold text-foreground">
          {renderRichInline(block.text, onCiteMath)}
        </Tag>,
      )
      return
    }
    if (block.type === "list") {
      const ListTag = block.ordered ? "ol" : "ul"
      nodes.push(
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
        </ListTag>,
      )
      return
    }
    nodes.push(
      <p key={index} className="whitespace-pre-wrap">
        {renderRichInline(block.text, onCiteMath)}
      </p>,
    )
  })

  flushImages(currentLetter, `imgs-${currentLetter || "stem"}-end`)
  for (const letter of Object.keys(imagesByLetter ?? {})) {
    flushImages(letter, `imgs-orphan-${letter || "stem"}`)
  }

  return (
    <div
      className={cn("flex flex-col gap-2 text-base leading-relaxed", className)}
    >
      {nodes}
    </div>
  )
}
