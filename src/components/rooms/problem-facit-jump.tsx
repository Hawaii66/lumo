import { ArrowDown, ArrowUp } from "lucide-react"
import { useEffect, useState } from "react"
import { cn } from "~/lib/utils"

export function problemSectionId(
  problemNumber: string,
  section: "question" | "answer",
): string {
  const safe = problemNumber.replace(/[^a-zA-Z0-9_-]/g, "_")
  return `lumo-problem-${safe}-${section}`
}

export function resolveProblemJumpTarget(
  sectionId: string,
  letter?: string,
): Element | null {
  const section = document.getElementById(sectionId)
  if (!section) return null
  if (letter && letter.length > 0) {
    return (
      section.querySelector(
        `[data-lumo-subproblem="${CSS.escape(letter)}"]`,
      ) ?? section
    )
  }
  return section
}

export function scrollToProblemSection(
  sectionId: string,
  letter?: string,
): void {
  resolveProblemJumpTarget(sectionId, letter)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  })
}

function getScrollParent(el: Element | null): Element | null {
  let parent = el?.parentElement ?? null
  while (parent) {
    const { overflowY } = getComputedStyle(parent)
    if (
      overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowY === "overlay"
    ) {
      return parent
    }
    parent = parent.parentElement
  }
  return null
}

type ProblemFacitJumpControlProps = {
  direction: "to-facit" | "to-question"
  targetSectionId: string
  /** Deluppgift letter; omit / `""` for whole-problem jump. */
  letter?: string
  /**
   * When false, the target is not in the DOM yet (e.g. facit hidden).
   * Treated as off-screen so the control stays available.
   */
  targetAvailable?: boolean
  onJump: () => void
  className?: string
}

/** Scroll between question and facit for a problem / deluppgift. */
export function ProblemFacitJumpControl({
  direction,
  targetSectionId,
  letter,
  targetAvailable = true,
  onJump,
  className,
}: ProblemFacitJumpControlProps) {
  const [targetOffscreen, setTargetOffscreen] = useState(true)
  const toFacit = direction === "to-facit"
  const label = toFacit ? "Gå till facit" : "Gå till frågan"
  const Icon = toFacit ? ArrowDown : ArrowUp

  useEffect(() => {
    if (!targetAvailable) {
      setTargetOffscreen(true)
      return
    }

    let observer: IntersectionObserver | null = null

    const attach = () => {
      observer?.disconnect()
      observer = null

      const target = resolveProblemJumpTarget(targetSectionId, letter)
      if (!target) {
        setTargetOffscreen(true)
        return
      }

      const root = getScrollParent(target)
      observer = new IntersectionObserver(
        ([entry]) => {
          setTargetOffscreen(!(entry?.isIntersecting ?? false))
        },
        { root, threshold: 0 },
      )
      observer.observe(target)
    }

    attach()

    const onResize = () => attach()
    window.addEventListener("resize", onResize)

    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", onResize)
    }
  }, [targetSectionId, letter, targetAvailable])

  // Always reserve h-8 w-8 so subproblem rows keep a stable width.
  if (!targetOffscreen) {
    return <span className={cn("inline-block h-8 w-8 shrink-0", className)} />
  }

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onJump}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-[transform,colors,background-color,border-color] duration-100",
        "hover:border-border hover:bg-muted/60 hover:text-foreground",
        "focus-visible:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        "active:scale-90",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  )
}
