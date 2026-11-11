import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { cn } from "~/lib/utils"

export type ProblemOccasionOption = {
  id: string
  label: string
}

export type ProblemOccasionEntry = {
  /** `""` = whole problem; otherwise `a`–`z`. */
  letter: string
  occasionId: string
  occasionLabel: string
}

export function occasionIdForLetter(
  entries: Array<ProblemOccasionEntry>,
  letter: string,
): string | null {
  const entry = entries.find((row) => row.letter === letter)
  return entry?.occasionId ?? null
}

const NONE_VALUE = "__none__"

type ProblemOccasionControlProps = {
  occasionId: string | null
  options: Array<ProblemOccasionOption>
  onChange: (occasionId: string | null) => void
  letter?: string
  disabled?: boolean
  className?: string
}

/** Compact tillfälle picker for the problem detail view. */
export function ProblemOccasionControl({
  occasionId,
  options,
  onChange,
  letter,
  disabled = false,
  className,
}: ProblemOccasionControlProps) {
  const scope =
    letter !== undefined && letter !== ""
      ? `deluppgift (${letter})`
      : "uppgiften"
  const selected = options.find((option) => option.id === occasionId) ?? null
  const value = occasionId ?? NONE_VALUE
  const items: Record<string, string> = {
    [NONE_VALUE]: "Tillfälle",
    ...Object.fromEntries(options.map((option) => [option.id, option.label])),
  }

  return (
    <Select
      value={value}
      items={items}
      disabled={disabled || options.length === 0}
      onValueChange={(next) => {
        if (next == null) return
        onChange(next === NONE_VALUE ? null : next)
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label={`Tillfälle för ${scope}`}
        title={
          options.length === 0
            ? "Inga tillfällen — skapa under Inställningar"
            : selected
              ? `Tillfälle: ${selected.label}`
              : `Välj tillfälle för ${scope}`
        }
        className={cn(
          "h-6 max-w-40 gap-1 border-border px-1.5 text-[10px] font-medium shadow-none",
          selected
            ? "border-sky-600/40 bg-sky-500/10 text-sky-800 dark:text-sky-200"
            : "text-muted-foreground",
          className,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" className="min-w-44">
        <SelectItem value={NONE_VALUE}>Otilldelad</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
