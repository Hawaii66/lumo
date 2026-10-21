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

function nodeElement(node: Node | null): Element | null {
  if (!node) return null
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement
}

function selectionInside(
  selection: Selection,
  container: HTMLElement,
): boolean {
  if (selection.rangeCount === 0 || selection.isCollapsed) return false
  const range = selection.getRangeAt(0)
  const el = nodeElement(range.commonAncestorContainer)
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

    function placeFromRect(rect: DOMRect, citation: CiteSelection) {
      const el = container!
      const containerRect = el.getBoundingClientRect()
      setPopup({
        x: rect.left + rect.width / 2 - containerRect.left + el.scrollLeft,
        y: rect.top - containerRect.top + el.scrollTop - 8,
        citation,
      })
    }

    function updateFromSelection() {
      const selection = window.getSelection()
      if (!selection || !selectionInside(selection, container!)) {
        clearPopup()
        return
      }

      // Ignore selections that start on the math cite button / math-field.
      const anchorEl = nodeElement(selection.anchorNode)
      if (
        anchorEl?.closest("[data-cite-math-btn]") ||
        anchorEl?.closest("math-field")
      ) {
        clearPopup()
        return
      }

      const responseNumber = readResponseNumber(
        anchorEl ?? nodeElement(selection.getRangeAt(0).commonAncestorContainer),
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
      if (target.closest("[data-cite-math-btn]")) return

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
      if (!selection || selection.isCollapsed) clearPopup()
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
