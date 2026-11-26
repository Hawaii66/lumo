import { IconCoin } from "@tabler/icons-react"
import {
  Check,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Footprints,
  Lightbulb,
  QrCode,
  ScanSearch,
  Star,
} from "lucide-react"
import { useState, type MouseEvent } from "react"
import { StaticMath } from "~/components/lumo/static-math"
import { MarkdownWithMath } from "~/components/lumo/markdown-with-math"
import { REASON_META } from "~/components/rooms/problem-reason"
import { TipDemoShell } from "~/components/rooms/tips/tip-demo-shell"
import type { RoomTipId } from "~/components/rooms/tips/room-tips-data"
import { celebrateFromPoint } from "~/lib/celebrate"
import { FALLBACK_CHAT_MODEL_LEVELS } from "~/lib/chat-model-level"
import {
  DASHBOARD_THEMES,
  DASHBOARD_THEME_LABELS,
  type DashboardTheme,
} from "~/lib/dashboard-theme"
import { PROBLEM_REASON_IDS } from "~/lib/problem-reasons"
import {
  PROBLEM_TEXT_SIZE_LABELS,
  PROBLEM_TEXT_SIZES,
  type ProblemTextSize,
} from "~/lib/problem-text-size"
import { cn } from "~/lib/utils"

/** Approximate swatches for the tip demo (not live CSS tokens). */
const THEME_SWATCHES: Record<
  DashboardTheme,
  { bg: string; accent: string }
> = {
  light: { bg: "bg-neutral-100", accent: "bg-sky-500" },
  dark: { bg: "bg-neutral-900", accent: "bg-sky-400" },
  purple: { bg: "bg-violet-950", accent: "bg-violet-400" },
  ocean: { bg: "bg-cyan-950", accent: "bg-teal-400" },
  rose: { bg: "bg-rose-950", accent: "bg-rose-400" },
}

function HelpActionsDemo() {
  return (
    <TipDemoShell>
      <div aria-hidden className="flex w-full max-w-[18rem] flex-col gap-2">
        <div className="flex items-center justify-center gap-1.5">
          <span className="rounded-md border border-sky-400 bg-sky-50 px-2 py-0.5 text-[9px] font-semibold text-sky-700 dark:border-sky-500 dark:bg-sky-950 dark:text-sky-200">
            Hela
          </span>
          <span className="rounded-md border border-neutral-300 bg-white px-2 py-0.5 text-[9px] font-semibold text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
            (a)
          </span>
          <span className="rounded-md border border-neutral-300 bg-white px-2 py-0.5 text-[9px] font-semibold text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
            (b)
          </span>
        </div>
        <div className="flex gap-1.5">
          <div className="flex flex-1 flex-col items-center gap-1 rounded-lg border border-neutral-300 bg-white px-1.5 py-2 text-center dark:border-neutral-700 dark:bg-neutral-900">
            <Footprints className="size-3.5 text-emerald-600" />
            <span className="text-[9px] font-semibold text-neutral-900 dark:text-neutral-100">
              Första steget
            </span>
          </div>
          <div className="flex flex-1 flex-col items-center gap-1 rounded-lg border border-neutral-300 bg-white px-1.5 py-2 text-center dark:border-neutral-700 dark:bg-neutral-900">
            <Lightbulb className="size-3.5 text-amber-600" />
            <span className="text-[9px] font-semibold text-neutral-900 dark:text-neutral-100">
              Genomgång
            </span>
          </div>
          <div className="flex flex-1 flex-col items-center gap-1 rounded-lg border border-neutral-300 bg-white px-1.5 py-2 text-center dark:border-neutral-700 dark:bg-neutral-900">
            <ScanSearch className="size-3.5 text-neutral-500" />
            <span className="text-[9px] font-semibold text-neutral-900 dark:text-neutral-100">
              Skanna
            </span>
          </div>
        </div>
      </div>
    </TipDemoShell>
  )
}

function PhoneScanDemo() {
  return (
    <TipDemoShell>
      <div
        aria-hidden
        className="flex items-center gap-3"
      >
        <div className="flex size-16 items-center justify-center rounded-lg border border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900">
          <QrCode className="size-10 text-neutral-800 dark:text-neutral-200" />
        </div>
        <div className="flex h-20 w-11 flex-col rounded-md border border-neutral-400 bg-neutral-900 p-1 shadow-sm">
          <div className="flex flex-1 items-center justify-center rounded-sm bg-neutral-800">
            <ScanSearch className="size-4 text-neutral-400" />
          </div>
        </div>
      </div>
    </TipDemoShell>
  )
}

function MathInputDemo() {
  return (
    <TipDemoShell>
      <div className="flex w-full max-w-[18rem] flex-col gap-2">
        <div
          aria-hidden
          className="inline-flex max-w-full flex-wrap items-baseline gap-x-1.5 rounded-2xl bg-white px-3 py-2 text-xs text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100"
        >
          <span>Kvadratkomplettera</span>
          <StaticMath
            latex={String.raw`f(x)=x^{2}-5x+25`}
            display="inline"
            className="text-neutral-900 dark:text-neutral-100"
          />
        </div>
        <div
          aria-hidden
          className="self-start rounded-md border border-dashed border-neutral-400 px-2 py-0.5 font-mono text-[10px] text-neutral-600 dark:text-neutral-400"
        >
          /formel
        </div>
      </div>
    </TipDemoShell>
  )
}

function MentionProblemsDemo() {
  return (
    <TipDemoShell>
      <div
        aria-hidden
        className="w-full max-w-[12rem] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="border-b border-neutral-200 px-2.5 py-1.5 font-mono text-[11px] text-neutral-700 dark:border-neutral-800 dark:text-neutral-300">
          @2<span className="text-primary">a</span>
        </div>
        <ul className="p-1 text-[11px]">
          {[
            { label: "2a", active: true },
            { label: "2b", active: false },
            { label: "3", active: false },
          ].map((row) => (
            <li
              key={row.label}
              className={cn(
                "rounded-md px-2 py-1 tabular-nums",
                row.active
                  ? "bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
                  : "text-neutral-500",
              )}
            >
              {row.label}
            </li>
          ))}
        </ul>
      </div>
    </TipDemoShell>
  )
}

function MarkCompleteDemo() {
  const problems = ["1", "2a", "2b"] as const
  const [completed, setCompleted] = useState<Record<string, boolean>>({
    "1": true,
    "2a": false,
    "2b": false,
  })

  function toggle(num: string, event: MouseEvent<HTMLButtonElement>) {
    const next = !completed[num]
    if (next) {
      const rect = event.currentTarget.getBoundingClientRect()
      celebrateFromPoint(
        (rect.left + rect.width / 2) / window.innerWidth,
        (rect.top + rect.height / 2) / window.innerHeight,
      )
    }
    setCompleted((current) => ({ ...current, [num]: next }))
  }

  return (
    <TipDemoShell>
      <div className="flex w-full max-w-[11rem] flex-col gap-1 rounded-lg bg-white p-1.5 dark:bg-neutral-900">
        {problems.map((num) => {
          const done = completed[num]
          const label = done
            ? `Markera ${num} som inte klar`
            : `Markera ${num} som klar`
          return (
            <div
              key={num}
              className="flex items-center gap-7 rounded-md px-2.5 py-1.5"
            >
              <span className="min-w-0 flex-1 text-sm font-semibold tracking-tight text-neutral-900 tabular-nums dark:text-neutral-100">
                {num}
              </span>
              <button
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={done}
                onClick={(event) => toggle(num, event)}
                className={cn(
                  "inline-flex size-6 shrink-0 items-center justify-center rounded-md border transition-[transform,colors,background-color,border-color] duration-100",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
                  "active:scale-90",
                  done
                    ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25 dark:text-emerald-400"
                    : "border-neutral-300 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:border-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300",
                )}
              >
                <Check
                  className={cn(
                    "size-3 transition-[opacity,transform] duration-150",
                    done
                      ? "stroke-[3] opacity-100 scale-100"
                      : "opacity-40 scale-90",
                  )}
                  aria-hidden
                />
              </button>
            </div>
          )
        })}
      </div>
    </TipDemoShell>
  )
}

function MarkReasonDemo() {
  const [selected, setSelected] = useState<(typeof PROBLEM_REASON_IDS)[number]>(
    "hard",
  )

  return (
    <TipDemoShell>
      <div
        className="grid w-full max-w-[16rem] grid-cols-2 gap-1.5"
        role="radiogroup"
        aria-label="Anledning"
      >
        {PROBLEM_REASON_IDS.map((id) => {
          const meta = REASON_META[id]
          const Icon = meta.Icon
          const active = selected === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setSelected(id)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2 py-2 text-left text-[10px] font-medium transition-colors",
                active
                  ? meta.chipClassName
                  : "border-neutral-300 bg-white text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
              )}
            >
              <Icon
                className={cn("size-3.5 shrink-0", meta.iconClassName)}
                aria-hidden
              />
              <span className="min-w-0 truncate">{meta.label}</span>
            </button>
          )
        })}
      </div>
    </TipDemoShell>
  )
}

type StarFilterLevel = 1 | 2 | 3

function StarDifficultyDemo() {
  const [starLevels, setStarLevels] = useState<Array<StarFilterLevel>>([1, 2])
  const showAllStars = starLevels.length === 0
  const starLevelSet = new Set(starLevels)

  function toggleAll() {
    setStarLevels([])
  }

  function toggleLevel(level: StarFilterLevel) {
    setStarLevels((current) => {
      if (current.includes(level)) {
        return current.filter((v) => v !== level)
      }
      return [...current, level].sort()
    })
  }

  return (
    <TipDemoShell>
      <div
        className="flex w-full max-w-sm items-stretch gap-0.5 rounded-lg bg-white p-0.5 dark:bg-neutral-900"
        role="group"
        aria-label="Filtrera efter stjärnor"
      >
        <button
          type="button"
          aria-label="Visa alla uppgifter (0–3 stjärnor)"
          aria-pressed={showAllStars}
          onClick={toggleAll}
          className={cn(
            "h-9 min-w-0 flex-1 rounded-md px-1 text-[10px] font-medium leading-none text-neutral-500 transition-colors dark:text-neutral-400",
            showAllStars &&
              "bg-neutral-100 text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100",
          )}
        >
          Alla
        </button>
        <div className="flex min-w-0 flex-[3] items-stretch">
          {([1, 2, 3] as const).map((level) => {
            const active = starLevelSet.has(level)
            const joinsLeft =
              active && starLevelSet.has((level - 1) as StarFilterLevel)
            const joinsRight =
              active && starLevelSet.has((level + 1) as StarFilterLevel)
            return (
              <button
                key={level}
                type="button"
                title={`Visa ${level} stjärn${level === 1 ? "a" : "or"}`}
                aria-label={`Visa ${level} stjärn${level === 1 ? "a" : "or"}`}
                aria-pressed={active}
                onClick={() => toggleLevel(level)}
                className={cn(
                  "flex h-9 min-w-0 flex-1 items-center justify-center gap-px border-0 px-1 transition-colors",
                  active &&
                    "bg-neutral-100 text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100",
                  !joinsLeft && !joinsRight && "rounded-md",
                  !joinsLeft && joinsRight && "rounded-l-md rounded-r-none",
                  joinsLeft && !joinsRight && "rounded-l-none rounded-r-md",
                  joinsLeft && joinsRight && "rounded-none",
                )}
              >
                {Array.from({ length: level }, (_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      "size-3.5",
                      active
                        ? "fill-amber-500 text-amber-500"
                        : "fill-none text-neutral-400 dark:text-neutral-500",
                    )}
                    aria-hidden
                  />
                ))}
              </button>
            )
          })}
        </div>
      </div>
    </TipDemoShell>
  )
}

function FacitToggleDemo() {
  const [show, setShow] = useState(false)

  return (
    <TipDemoShell>
      <div className="flex w-full max-w-[14rem] flex-col gap-2 rounded-lg bg-white p-2.5 dark:bg-neutral-900">
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="inline-flex items-center gap-1.5 self-start rounded-md border border-neutral-300 px-2 py-1 text-[10px] font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
          aria-pressed={show}
        >
          {show ? (
            <EyeOff className="size-3" aria-hidden />
          ) : (
            <Eye className="size-3" aria-hidden />
          )}
          {show ? "Dölj facit" : "Visa facit"}
        </button>
        <p
          className={cn(
            "rounded-md bg-neutral-100 px-2 py-1.5 text-xs tabular-nums text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200",
            !show && "select-none blur-[5px]",
          )}
        >
          x = 3 eller x = −1
        </p>
      </div>
    </TipDemoShell>
  )
}

function TwinProblemsDemo() {
  return (
    <TipDemoShell>
      <div
        aria-hidden
        className="flex w-full max-w-[16rem] items-stretch gap-2"
      >
        <div className="flex flex-1 flex-col gap-1 rounded-lg border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-[9px] font-medium tracking-wide text-neutral-500 uppercase">
            Original
          </span>
          <span className="text-sm font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
            2a
          </span>
          <span className="text-[10px] text-neutral-500">Beräkna …</span>
        </div>
        <div className="flex items-center">
          <Copy className="size-3.5 text-neutral-400" />
        </div>
        <div className="flex flex-1 flex-col gap-1 rounded-lg border border-violet-500/40 bg-violet-500/10 p-2">
          <span className="text-[9px] font-medium tracking-wide text-violet-600 uppercase">
            Tvilling
          </span>
          <span className="text-sm font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
            2a′
          </span>
          <span className="text-[10px] text-neutral-500">Nya tal …</span>
        </div>
      </div>
    </TipDemoShell>
  )
}

function ChangeModelDemo() {
  const [open, setOpen] = useState(true)
  const [level, setLevel] = useState(2)
  const levels = FALLBACK_CHAT_MODEL_LEVELS
  const current = levels.find((row) => row.level === level) ?? levels[0]!

  return (
    <TipDemoShell className="min-h-[10rem]">
      <div className="relative flex w-full max-w-[14rem] flex-col items-stretch gap-1.5">
        <div
          className="flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
          role="group"
          aria-label="Chattmodell"
        >
          <span className="text-[10px] font-medium text-neutral-500">
            Modell
          </span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-7 min-w-0 flex-1 items-center justify-between gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-2 text-[11px] font-medium text-neutral-800 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200"
            aria-expanded={open}
          >
            <span className="truncate">
              {current.name} · {current.creditCost}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-neutral-400" />
          </button>
        </div>
        {open ? (
          <ul
            className="overflow-hidden rounded-lg border border-neutral-200 bg-white p-1 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
            role="listbox"
            aria-label="Välj modell"
          >
            {levels.map((entry) => {
              const selected = entry.level === level
              return (
                <li key={entry.level}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      setLevel(entry.level)
                      setOpen(false)
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px]",
                      selected
                        ? "bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
                        : "text-neutral-600 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-neutral-800/60",
                    )}
                  >
                    <Check
                      className={cn(
                        "size-3 shrink-0",
                        selected ? "opacity-100" : "opacity-0",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {entry.name}
                    </span>
                    <span className="tabular-nums text-neutral-500">
                      {entry.creditCost}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}
        <p
          aria-hidden
          className="text-center font-mono text-[9px] text-neutral-500"
        >
          /modell
        </p>
      </div>
    </TipDemoShell>
  )
}

function DefaultModelDemo() {
  const [selected, setSelected] = useState(1)
  const levels = FALLBACK_CHAT_MODEL_LEVELS

  return (
    <TipDemoShell>
      <div
        className="flex w-full max-w-[16rem] flex-col gap-0.5 rounded-lg bg-muted/60 p-0.5 sm:flex-row sm:items-stretch"
        role="group"
        aria-label="Standardmodell"
      >
        {levels.map((entry) => {
          const active = selected === entry.level
          return (
            <button
              key={entry.level}
              type="button"
              aria-pressed={active}
              onClick={() => setSelected(entry.level)}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-0.5 rounded-md px-2 py-2 text-[10px] transition-colors",
                active
                  ? "bg-white font-medium text-neutral-900 shadow-sm dark:bg-neutral-950 dark:text-neutral-100"
                  : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300",
              )}
            >
              {active ? (
                <Star
                  className="absolute top-1 right-1 size-2.5 fill-amber-500 text-amber-500"
                  aria-hidden
                />
              ) : null}
              <span>{entry.name}</span>
              <span className="tabular-nums text-[9px] text-neutral-500">
                {entry.creditCost} cr
              </span>
            </button>
          )
        })}
      </div>
    </TipDemoShell>
  )
}

const PREVIEW_MARKDOWN =
  "Beräkna integralen $\\int_0^1 x^2\\,dx$ och förenkla svaret."

function TextSizeDemo() {
  const [size, setSize] = useState<ProblemTextSize>("medium")

  return (
    <TipDemoShell className="min-h-[9rem]">
      <div className="flex w-full max-w-[16rem] flex-col gap-2">
        <div
          className="flex rounded-lg bg-muted/60 p-0.5"
          role="group"
          aria-label="Textstorlek"
        >
          {PROBLEM_TEXT_SIZES.map((value) => {
            const active = size === value
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => setSize(value)}
                className={cn(
                  "flex-1 rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors",
                  active
                    ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-950 dark:text-neutral-100"
                    : "text-neutral-500",
                )}
              >
                {PROBLEM_TEXT_SIZE_LABELS[value]}
              </button>
            )
          })}
        </div>
        <div
          data-lumo-text-size={size}
          className="rounded-lg bg-white px-2.5 py-2 text-left dark:bg-neutral-900"
        >
          <MarkdownWithMath markdown={PREVIEW_MARKDOWN} />
        </div>
      </div>
    </TipDemoShell>
  )
}

function ChangeThemeDemo() {
  const [selected, setSelected] = useState<DashboardTheme>("ocean")

  return (
    <TipDemoShell>
      <div
        className="flex w-full max-w-[16rem] flex-col gap-2"
        role="group"
        aria-label="Tema"
      >
        <div
          className={cn(
            "flex h-12 items-end justify-between rounded-lg px-3 py-2 transition-colors",
            THEME_SWATCHES[selected].bg,
          )}
        >
          <span
            className={cn(
              "text-[10px] font-medium",
              selected === "light" ? "text-neutral-700" : "text-white/90",
            )}
          >
            {DASHBOARD_THEME_LABELS[selected]}
          </span>
          <span
            className={cn(
              "size-4 rounded-full shadow-sm",
              THEME_SWATCHES[selected].accent,
            )}
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {DASHBOARD_THEMES.map((theme) => {
            const active = selected === theme
            return (
              <button
                key={theme}
                type="button"
                aria-pressed={active}
                title={DASHBOARD_THEME_LABELS[theme]}
                aria-label={DASHBOARD_THEME_LABELS[theme]}
                onClick={() => setSelected(theme)}
                className={cn(
                  "flex items-center gap-1 rounded-md border px-1.5 py-1 text-[9px] font-medium transition-colors",
                  active
                    ? "border-neutral-400 bg-white text-neutral-900 shadow-sm dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
                    : "border-transparent bg-white/70 text-neutral-600 dark:bg-neutral-900/70 dark:text-neutral-400",
                )}
              >
                <span
                  className={cn(
                    "size-2.5 rounded-full ring-1 ring-black/10",
                    THEME_SWATCHES[theme].accent,
                  )}
                  aria-hidden
                />
                {DASHBOARD_THEME_LABELS[theme]}
              </button>
            )
          })}
        </div>
      </div>
    </TipDemoShell>
  )
}

function CreditsDemo() {
  return (
    <TipDemoShell>
      <div
        aria-hidden
        className="w-full max-w-[9.5rem] rounded-lg bg-white px-3 py-3 dark:bg-neutral-900"
      >
        <div className="flex items-center gap-1.5">
          <IconCoin className="size-3 text-amber-500" />
          <p className="text-[10px] font-medium tracking-wide text-neutral-500 uppercase">
            Dagliga
          </p>
        </div>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900 tabular-nums dark:text-neutral-100">
          25
        </p>
        <p className="mt-0.5 text-[10px] text-neutral-500">av 25 gratis/dag</p>
      </div>
    </TipDemoShell>
  )
}

function OccasionsDemo() {
  return (
    <TipDemoShell>
      <div
        aria-hidden
        className="flex w-full max-w-[14rem] flex-col gap-1.5 rounded-lg bg-white p-2 dark:bg-neutral-900"
      >
        {["Lektion 1 (1/1)", "Lektion 2 (8/1)", "Lektion 3 (15/1)"].map(
          (label, index) => (
            <div
              key={label}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-[11px]",
                index === 0
                  ? "bg-neutral-100 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
                  : "text-neutral-500",
              )}
            >
              {label}
            </div>
          ),
        )}
        <div className="mt-0.5 rounded-md bg-primary px-2.5 py-1.5 text-center text-[10px] font-medium text-primary-foreground">
          Fortsätt med 1a
        </div>
      </div>
    </TipDemoShell>
  )
}

export function TipDemo({ tipId }: { tipId: RoomTipId }) {
  switch (tipId) {
    case "forsta-steget":
    case "genomgang":
      return <HelpActionsDemo />
    case "phone-scan":
      return <PhoneScanDemo />
    case "math-input":
      return <MathInputDemo />
    case "mention-problems":
      return <MentionProblemsDemo />
    case "mark-complete":
      return <MarkCompleteDemo />
    case "mark-reason":
      return <MarkReasonDemo />
    case "star-difficulty":
      return <StarDifficultyDemo />
    case "facit-toggle":
      return <FacitToggleDemo />
    case "twin-problems":
      return <TwinProblemsDemo />
    case "change-model":
      return <ChangeModelDemo />
    case "default-model":
      return <DefaultModelDemo />
    case "text-size":
      return <TextSizeDemo />
    case "change-theme":
      return <ChangeThemeDemo />
    case "credits":
      return <CreditsDemo />
    case "occasions":
      return <OccasionsDemo />
  }
}
