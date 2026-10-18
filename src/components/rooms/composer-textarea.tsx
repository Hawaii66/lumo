import {
  forwardRef,
  useMemo,
  useRef,
  type ComponentProps,
  type ReactNode,
  type UIEvent,
} from "react"
import { PROBLEM_MENTION_RE, formatMathRef } from "~/lib/chat-composer"
import { cn } from "~/lib/utils"

type ComposerTextareaProps = Omit<ComponentProps<"textarea">, "value"> & {
  value: string
  /** Math refs currently attached — their `(n)` tokens are highlighted. */
  mathRefs?: ReadonlySet<number> | Array<number>
}

type HighlightRange = {
  start: number
  end: number
}

function collectHighlightRanges(
  text: string,
  mathRefs: ReadonlySet<number>,
): Array<HighlightRange> {
  const ranges: Array<HighlightRange> = []

  for (const match of text.matchAll(PROBLEM_MENTION_RE)) {
    if (match.index === undefined) continue
    ranges.push({
      start: match.index,
      end: match.index + match[0].length,
    })
  }

  for (const ref of mathRefs) {
    const token = formatMathRef(ref)
    let from = 0
    while (from < text.length) {
      const index = text.indexOf(token, from)
      if (index < 0) break
      ranges.push({ start: index, end: index + token.length })
      from = index + token.length
    }
  }

  ranges.sort((a, b) => a.start - b.start || a.end - b.end)

  const merged: Array<HighlightRange> = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (last && range.start < last.end) {
      last.end = Math.max(last.end, range.end)
      continue
    }
    merged.push({ ...range })
  }
  return merged
}

function renderHighlightedText(
  text: string,
  mathRefs: ReadonlySet<number>,
): ReactNode {
  if (!text) return null

  const ranges = collectHighlightRanges(text, mathRefs)
  if (ranges.length === 0) return text

  const nodes: Array<ReactNode> = []
  let cursor = 0
  for (const range of ranges) {
    if (range.start > cursor) {
      nodes.push(text.slice(cursor, range.start))
    }
    nodes.push(
      <span
        key={`${range.start}-${range.end}`}
        className="font-bold text-primary"
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

const sharedTextClassName =
  "field-sizing-content min-h-16 w-full px-2.5 py-2 text-base md:text-sm whitespace-pre-wrap break-words"

/**
 * Textarea with a backdrop that paints `@mentions` and `(n)` math refs
 * in bold primary (orange) while keeping a normal caret/selection.
 */
export const ComposerTextarea = forwardRef<
  HTMLTextAreaElement,
  ComposerTextareaProps
>(function ComposerTextarea(
  { value, mathRefs, className, onScroll, disabled, ...props },
  forwardedRef,
) {
  const localRef = useRef<HTMLTextAreaElement | null>(null)
  const backdropRef = useRef<HTMLDivElement | null>(null)

  const refSet = useMemo(() => {
    if (!mathRefs) return new Set<number>()
    return mathRefs instanceof Set ? mathRefs : new Set(mathRefs)
  }, [mathRefs])

  const highlighted = useMemo(
    () => renderHighlightedText(value, refSet),
    [value, refSet],
  )

  function setRefs(node: HTMLTextAreaElement | null) {
    localRef.current = node
    if (typeof forwardedRef === "function") {
      forwardedRef(node)
    } else if (forwardedRef) {
      forwardedRef.current = node
    }
  }

  function syncScroll(event: UIEvent<HTMLTextAreaElement>) {
    const backdrop = backdropRef.current
    if (backdrop) {
      backdrop.scrollTop = event.currentTarget.scrollTop
      backdrop.scrollLeft = event.currentTarget.scrollLeft
    }
    onScroll?.(event)
  }

  return (
    <div
      className={cn(
        "relative rounded-lg border border-input bg-transparent transition-colors",
        "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        "dark:bg-input/30",
        disabled && "opacity-50 dark:bg-input/80",
      )}
    >
      <div
        ref={backdropRef}
        aria-hidden
        className={cn(
          sharedTextClassName,
          "pointer-events-none absolute inset-0 overflow-hidden text-foreground",
        )}
      >
        {highlighted}
        {value.endsWith("\n") ? "\n" : null}
      </div>
      <textarea
        ref={setRefs}
        data-slot="textarea"
        value={value}
        disabled={disabled}
        onScroll={syncScroll}
        className={cn(
          sharedTextClassName,
          "relative z-10 flex resize-none border-0 bg-transparent text-transparent caret-foreground outline-none",
          "placeholder:text-muted-foreground",
          "disabled:cursor-not-allowed",
          "selection:bg-primary/25 selection:text-transparent",
          className,
        )}
        {...props}
      />
    </div>
  )
})
