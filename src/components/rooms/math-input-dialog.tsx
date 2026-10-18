import { useEffect, useRef, useState } from "react"
import { MathField, type MathFieldHandle } from "~/components/math-field"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"

type MathInputDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Initial latex when editing an existing chip. */
  initialLatex?: string
  onConfirm: (latex: string) => void
  title?: string
  confirmLabel?: string
}

export function MathInputDialog({
  open,
  onOpenChange,
  initialLatex = "",
  onConfirm,
  title = "Skriv formel",
  confirmLabel = "Lägg till",
}: MathInputDialogProps) {
  const [latex, setLatex] = useState(initialLatex)
  const latexRef = useRef(latex)
  latexRef.current = latex
  const mathRef = useRef<MathFieldHandle>(null)

  useEffect(() => {
    if (!open) return
    setLatex(initialLatex)
    const id = window.setTimeout(() => {
      mathRef.current?.focus()
    }, 80)
    return () => window.clearTimeout(id)
  }, [open, initialLatex])

  function handleConfirm() {
    const trimmed = latexRef.current.trim()
    if (!trimmed) return
    onConfirm(trimmed)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Skriv matematiken som vanligt, t.ex. f(x)=3x^2 — den formateras
            automatiskt. Tryck Enter för att lägga till.
          </DialogDescription>
        </DialogHeader>

        {open ? (
          <MathField
            ref={mathRef}
            value={latex}
            onChange={setLatex}
            onEnter={handleConfirm}
            autoFocus
            className="min-h-16 text-lg"
          />
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Avbryt
          </Button>
          <Button
            type="button"
            disabled={latex.trim().length === 0}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
