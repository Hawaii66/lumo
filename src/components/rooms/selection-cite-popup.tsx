import { Quote } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { RefObject } from "react"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"

export type CiteSelection = {
  responseNumber: number
  text?: string
  latex?: string
}

type SelectionCitePopupProps = {
  /** Element that contains assistant message bubbles (scroll container). */
  containerRef: RefObject<HTMLDivElement | null>
  onCite: (citation: CiteSelection) => void
  className?: string
}

type PopupState = {
  x: number
  y: number
  citation: CiteSelection
}

function readResponseNumber(node: Element | null): number | null {
  const host = node?.closest("[data-assistant-response]")
  if (!host) return null
  const raw = host.getAttribute("data-assistant-response")
  if (!raw) return null
  const number = Number(raw)
  return Number.isFinite(number) && number > 0 ? number : null
}

function selectionInside(
  selection: Selection,
  container: HTMLElement,
): boolean {
  if (selection.rangeCount === 0 || selection.isCollapsed) return false
  const range = selection.getRangeAt(0)
  const common = range.commonAncestorContainer
  const el =
    common.nodeType === Node.ELEMENT_NODE
      ? (common as Element)
      : common.parentElement
  return el !== null && container.contains(el)
}

export function SelectionCitePopup({
  containerRef,
  onCite,
  className,
}: SelectionCitePopupProps) {
  const [popup, setPopup] = useState<PopupState | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function clearPopup() {
      setPopup(null)
    }

    function placeFromRect(
      rect: DOMRect,
      citation: CiteSelection,
    ) {
      const el = container!
      const containerRect = el.getBoundingClientRect()
      setPopup({
        x:
          rect.left +
          rect.width / 2 -
          containerRect.left +
          el.scrollLeft,
        y: rect.top - containerRect.top + el.scrollTop - 8,
        citation,
      })
    }

    function updateFromSelection() {
      const selection = window.getSelection()
      if (!selection || !selectionInside(selection, container!)) {
        // Keep math-click popup until dismissed; only clear text selections.
        setPopup((current) =>
          current?.citation.latex && !current.citation.text ? current : null,
        )
        return
      }

      const responseNumber = readResponseNumber(
        selection.anchorNode?.parentElement ?? null,
      )
      if (responseNumber === null) {
        clearPopup()
        return
      }

      const text = selection.toString().replace(/\s+/g, " ").trim()
      if (!text) {
        clearPopup()
        return
      }

      const range = selection.getRangeAt(0)
      placeFromRect(range.getBoundingClientRect(), {
        responseNumber,
        text,
      })
    }

    function handleMouseUp(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Element)) return
      if (!container!.contains(target)) return

      const mathHost = target.closest("[data-cite-math]")
      if (mathHost instanceof HTMLElement) {
        const responseNumber = readResponseNumber(mathHost)
        const latex = mathHost.getAttribute("data-latex")?.trim()
        if (responseNumber !== null && latex) {
          placeFromRect(mathHost.getBoundingClientRect(), {
            responseNumber,
            latex,
          })
          return
        }
      }

      // Defer so the selection is committed after mouseup.
      window.requestAnimationFrame(updateFromSelection)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") clearPopup()
    }

    function handleScroll() {
      clearPopup()
    }

    function handleSelectionChange() {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) {
        setPopup((current) =>
          current?.citation.latex && !current.citation.text ? current : null,
        )
      }
    }

    container.addEventListener("mouseup", handleMouseUp)
    container.addEventListener("scroll", handleScroll, { passive: true })
    document.addEventListener("keydown", handleKeyDown)
    document.addEventListener("selectionchange", handleSelectionChange)

    return () => {
      container.removeEventListener("mouseup", handleMouseUp)
      container.removeEventListener("scroll", handleScroll)
      document.removeEventListener("keydown", handleKeyDown)
      document.removeEventListener("selectionchange", handleSelectionChange)
    }
  }, [containerRef])

  if (!popup) return null

  return (
    <div
      ref={popupRef}
      className={cn(
        "pointer-events-auto absolute z-30 -translate-x-1/2 -translate-y-full",
        className,
      )}
      style={{ left: popup.x, top: popup.y }}
    >
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="shadow-md"
        onMouseDown={(event) => {
          // Prevent clearing the selection before we read it.
          event.preventDefault()
        }}
        onClick={() => {
          onCite(popup.citation)
          window.getSelection()?.removeAllRanges()
          setPopup(null)
        }}
      >
        <Quote className="size-3.5" />
        Citera
      </Button>
    </div>
  )
}
