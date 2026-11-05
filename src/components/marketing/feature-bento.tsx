import {
  IconChartBar,
  IconChevronDown,
  IconCircleCheck,
  IconCoin,
  IconFileText,
  IconMathFunction,
  IconMessageChatbot,
  IconSearch,
  IconStarFilled,
} from "@tabler/icons-react"
import { Check, ScanSearch, Star } from "lucide-react"
import { motion, useScroll, useTransform, type MotionValue } from "motion/react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { StaticMath } from "~/components/lumo/static-math"
import { CtaDashedGrid } from "~/components/marketing/cta-dashed-grid"
import { FaqAccordion } from "~/components/marketing/faq-accordion"
import { cn } from "~/lib/utils"

/** Aceternity grid background shell for bento headers. */
function BentoHeaderShell({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative flex h-full min-h-[5rem] w-full flex-1 items-center justify-center overflow-hidden rounded-lg bg-neutral-950 bg-grid-white px-4 py-3",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-neutral-950 [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]"
      />
      <div className="relative z-10 flex h-full w-full min-h-0 flex-1 items-center justify-center">
        {children}
      </div>
    </div>
  )
}

/** Mini mock of the room sidebar problem selector (search + stars + grouped list). */
function ProblemSelectorSkeleton() {
  const groups = [
    {
      file: "Tentamen 2024-03.pdf",
      count: 12,
      problems: [
        { num: "1", stars: 1 as const, selected: false, done: true },
        { num: "2a", stars: 2 as const, selected: true, done: false },
        { num: "2b", stars: 3 as const, selected: false, done: false },
        { num: "3", stars: 2 as const, selected: false, done: false },
      ],
    },
    {
      file: "Övningar.pdf",
      count: 8,
      problems: [
        { num: "1.1", stars: 1 as const, selected: false, done: false },
        { num: "1.2", stars: 2 as const, selected: false, done: true },
      ],
    },
  ]

  return (
    <BentoHeaderShell className="min-h-[12rem] p-2.5">
      <div
        aria-hidden
        className="flex min-h-0 w-full flex-col gap-1.5 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 p-2"
      >
        <div className="flex h-6 shrink-0 items-center gap-1.5 rounded-md bg-neutral-950 px-2 text-[9px] text-neutral-500">
          <IconSearch className="size-2.5 shrink-0" />
          <span className="truncate">Sök uppgifter…</span>
        </div>

        <div className="flex shrink-0 items-stretch gap-0.5 rounded-md bg-neutral-800 p-0.5">
          <div className="flex h-5 min-w-0 flex-1 items-center justify-center rounded bg-neutral-950 text-[8px] font-medium text-neutral-200 shadow-sm">
            Alla
          </div>
          <div className="flex min-w-0 flex-[3] items-stretch">
            {([1, 2, 3] as const).map((level) => (
              <div
                key={level}
                className="flex h-5 min-w-0 flex-1 items-center justify-center gap-px rounded-md"
              >
                {Array.from({ length: level }, (_, i) => (
                  <IconStarFilled
                    key={i}
                    className="size-2 text-neutral-500"
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Intrinsic height — avoid flex-1/min-h-0 or the list collapses in auto-sized cards */}
        <div className="flex shrink-0 flex-col gap-1.5">
          {groups.map((group) => (
            <div key={group.file} className="min-w-0">
              <div className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[9px] font-medium tracking-wide text-neutral-500 uppercase">
                <IconChevronDown className="size-2.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate normal-case">
                  {group.file}
                </span>
                <span className="shrink-0 rounded bg-neutral-800 px-1 py-px text-[8px] font-medium normal-case tabular-nums text-neutral-400">
                  {group.count}
                </span>
              </div>
              <div className="mt-0.5 space-y-0.5">
                {group.problems.map((problem) => (
                  <div
                    key={problem.num}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px]",
                      problem.selected
                        ? "bg-primary/20 text-white"
                        : "text-neutral-300",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium tabular-nums">
                      {problem.num}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1">
                      <span className="inline-flex items-center gap-px">
                        {Array.from({ length: problem.stars }, (_, i) => (
                          <IconStarFilled
                            key={i}
                            className="size-2 text-amber-500"
                          />
                        ))}
                      </span>
                      {problem.done ? (
                        <IconCircleCheck className="size-2.5 text-emerald-500" />
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </BentoHeaderShell>
  )
}

/** Interactive mark-complete control, matching the problem detail toggle. */
function MarkCompleteHeader() {
  const problems = ["1", "2a", "2b"] as const
  const [completed, setCompleted] = useState<Record<string, boolean>>({
    "1": true,
    "2a": false,
    "2b": false,
  })

  function toggle(num: string) {
    setCompleted((current) => ({ ...current, [num]: !current[num] }))
  }

  return (
    <BentoHeaderShell>
      <div className="flex w-full max-w-[11rem] flex-col gap-1 rounded-lg bg-neutral-900 p-1.5">
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
              <span className="min-w-0 flex-1 text-sm font-semibold tracking-tight text-neutral-100 tabular-nums">
                {num}
              </span>
              <button
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={done}
                onClick={() => toggle(num)}
                className={cn(
                  "inline-flex size-6 shrink-0 items-center justify-center rounded-md border transition-[transform,colors,background-color,border-color] duration-100",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
                  "active:scale-90",
                  done
                    ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                    : "border-neutral-700 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300",
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
    </BentoHeaderShell>
  )
}

/** Simple chat bubble with rendered math inline. */
function FormelCommandHeader() {
  return (
    <BentoHeaderShell>
      <div
        aria-hidden
        className="inline-flex max-w-full items-baseline gap-x-1.5 whitespace-nowrap rounded-2xl bg-neutral-900 px-3.5 py-2.5 text-sm text-neutral-100"
      >
        <span>Kvadratkomplettera</span>
        <StaticMath
          latex={String.raw`f(x)=x^{2}-5x+25`}
          display="inline"
          className="text-neutral-100"
        />
        <span>och bestäm största/minsta värde</span>
      </div>
    </BentoHeaderShell>
  )
}

/** Daily credits balance mock, matching the profile credits card. */
function DailyCreditsHeader() {
  return (
    <BentoHeaderShell>
      <div
        aria-hidden
        className="w-full max-w-[9.5rem] rounded-lg bg-neutral-900 px-3 py-3"
      >
        <div className="flex items-center gap-1.5">
          <IconCoin className="size-3 text-amber-500" />
          <p className="text-[10px] font-medium tracking-wide text-neutral-500 uppercase">
            Dagliga
          </p>
        </div>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-neutral-100 tabular-nums">
          25
        </p>
        <p className="mt-0.5 text-[10px] text-neutral-500">av 25 gratis/dag</p>
      </div>
    </BentoHeaderShell>
  )
}

/** Tolka button mock, matching the files-page ParsePdfDialog trigger. */
function TolkaButtonHeader() {
  return (
    <BentoHeaderShell>
      <div
        aria-hidden
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-4 text-sm font-medium text-neutral-200 shadow-sm"
      >
        <ScanSearch className="size-4 shrink-0" />
        Tolka
      </div>
    </BentoHeaderShell>
  )
}

type StarFilterLevel = 1 | 2 | 3

const STAR_LEVEL_OPTIONS: Array<{
  level: StarFilterLevel
  title: string
}> = [
  { level: 1, title: "Visa 1 stjärna" },
  { level: 2, title: "Visa 2 stjärnor" },
  { level: 3, title: "Visa 3 stjärnor" },
]

/** Interactive gold-star level filter, matching the room sidebar control. */
function DifficultyStarsHeader() {
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
    <BentoHeaderShell>
      <div
        className="flex w-full max-w-sm items-stretch gap-0.5 rounded-lg bg-neutral-900 p-0.5"
        role="group"
        aria-label="Filtrera efter stjärnor"
      >
        <button
          type="button"
          aria-label="Visa alla uppgifter (0–3 stjärnor)"
          aria-pressed={showAllStars}
          onClick={toggleAll}
          className={cn(
            "h-9 min-w-0 flex-1 rounded-md px-1 text-[10px] font-medium leading-none text-neutral-400 transition-colors",
            showAllStars && "bg-neutral-800 text-neutral-100 shadow-sm",
          )}
        >
          Alla
        </button>
        <div className="flex min-w-0 flex-[3] items-stretch">
          {STAR_LEVEL_OPTIONS.map((option) => {
            const active = starLevelSet.has(option.level)
            const joinsLeft =
              active &&
              starLevelSet.has((option.level - 1) as StarFilterLevel)
            const joinsRight =
              active &&
              starLevelSet.has((option.level + 1) as StarFilterLevel)
            return (
              <button
                key={option.level}
                type="button"
                title={option.title}
                aria-label={option.title}
                aria-pressed={active}
                onClick={() => toggleLevel(option.level)}
                className={cn(
                  "flex h-9 min-w-0 flex-1 items-center justify-center gap-px border-0 px-1 transition-colors",
                  active && "bg-neutral-800 text-neutral-100 shadow-sm",
                  !joinsLeft && !joinsRight && "rounded-md",
                  !joinsLeft && joinsRight && "rounded-l-md rounded-r-none",
                  joinsLeft && !joinsRight && "rounded-l-none rounded-r-md",
                  joinsLeft && joinsRight && "rounded-none",
                )}
              >
                {Array.from({ length: option.level }, (_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      "size-3.5",
                      active
                        ? "fill-amber-500 text-amber-500"
                        : "fill-none text-neutral-500",
                    )}
                    aria-hidden
                  />
                ))}
              </button>
            )
          })}
        </div>
      </div>
    </BentoHeaderShell>
  )
}

type BentoItem = {
  title: string
  description: string
  header: ReactNode
  className: string
  icon: ReactNode
  flyIndex: number
}

/**
 * Desktop grid (3 cols):
 * R1: Korrekt matematikinput (1–2) | Markera som klar (3)
 * R2: Credits (1) | PDF studiemetoder (2) | Uppgiftsväljare (3, spans R2–3)
 * R3: Svårighet (1–2)                   | Uppgiftsväljare …
 */
const items: BentoItem[] = [
  {
    title: "Korrekt matematikinput",
    description:
      "Skriv till AI med korrekt formaterad matematik så den direkt förstår vad du faktiskt menar — och kommunikationen blir tydligare.",
    header: <FormelCommandHeader />,
    className: "md:col-start-1 md:col-span-2 md:row-start-1",
    icon: <IconMathFunction className="h-4 w-4 text-primary" />,
    flyIndex: 0,
  },
  {
    title: "Markera som klar",
    description: "Markera färdiga uppgifter som klara.",
    header: <MarkCompleteHeader />,
    className: "md:col-start-3 md:row-start-1",
    icon: <IconCircleCheck className="h-4 w-4 text-primary" />,
    flyIndex: 1,
  },
  {
    title: "Gratis dagliga credits",
    description: "Gratis dagliga credits för motiverande vardagsplugg.",
    header: <DailyCreditsHeader />,
    className: "md:col-start-1 md:row-start-2",
    icon: <IconCoin className="h-4 w-4 text-primary" />,
    flyIndex: 2,
  },
  {
    title: "PDF → studiemetoder",
    description:
      "Ladda upp PDF:er och extrahera information som rekommenderade metoder så att AI hjälper dig på rätt sätt från början.",
    header: <TolkaButtonHeader />,
    className: "md:col-start-2 md:row-start-2",
    icon: <IconFileText className="h-4 w-4 text-primary" />,
    flyIndex: 3,
  },
  {
    title: "Uppgiftsväljare → chatt",
    description:
      "Välj uppgifter från alla parsade PDF:er (exempelsamlingar, tentor, kontrollskrivningar, egna) på ett ställe och starta en chatt direkt från den uppgiften.",
    header: <ProblemSelectorSkeleton />,
    className: "md:col-start-3 md:row-start-2 md:row-span-2",
    icon: <IconMessageChatbot className="h-4 w-4 text-primary" />,
    flyIndex: 4,
  },
  {
    title: "Svårighetsbedömning",
    description:
      "Poängsätt uppgifter efter svårighet så du vet i vilken ordning du ska plugga dem.",
    header: <DifficultyStarsHeader />,
    className: "md:col-start-1 md:col-span-2 md:row-start-3",
    icon: <IconChartBar className="h-4 w-4 text-primary" />,
    flyIndex: 5,
  },
]

/**
 * Progress 0 = CTA at bottom third, progress 1 = CTA at screen center.
 * Cards travel all the way under the CTA (measured), then fade.
 */
function useFlyUnderCta(
  progress: MotionValue<number>,
  flyIndex: number,
  travelY: number,
) {
  const start = flyIndex * 0.04
  const mid = 0.55
  const end = 1
  // Fan slightly toward CTA center while diving under it
  const xTarget = (flyIndex - 2.5) * 18
  const y = useTransform(progress, [start, end], [0, travelY])
  const x = useTransform(progress, [start, end], [0, xTarget])
  const scale = useTransform(progress, [start, mid, end], [1, 0.55, 0.28])
  // Fade while sliding under the CTA (before they've gone past it)
  const opacity = useTransform(progress, [0, 0.45, 0.7, 0.85], [1, 1, 0.25, 0])
  const rotate = useTransform(
    progress,
    [start, end],
    [0, flyIndex % 2 === 0 ? -14 : 16],
  )
  const zIndex = useTransform(progress, (v) => (v > 0.35 ? 5 : 15))
  return { y, x, scale, opacity, rotate, zIndex }
}

function FlyingBentoCard({
  item,
  progress,
  travelY,
}: {
  item: BentoItem
  progress: MotionValue<number>
  travelY: number
}) {
  // Top-row cards travel farther; bottom-row cards less
  const distance =
    travelY - item.flyIndex * 56 + (item.flyIndex <= 1 ? 80 : 0)
  const { y, x, scale, opacity, rotate, zIndex } = useFlyUnderCta(
    progress,
    item.flyIndex,
    Math.max(distance, 280),
  )

  return (
    <motion.div
      style={{ y, x, scale, opacity, rotate, zIndex }}
      className={cn(
        "group/bento row-span-1 flex flex-col justify-between space-y-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm will-change-transform dark:border-neutral-800 dark:bg-neutral-950",
        item.className,
      )}
    >
      {item.header}
      <div className="transition duration-200 group-hover/bento:translate-x-2">
        {item.icon}
        <div className="mt-2 mb-2 font-sans font-bold text-neutral-900 dark:text-white">
          {item.title}
        </div>
        <div className="font-sans text-xs font-normal text-neutral-600 dark:text-neutral-400">
          {item.description}
        </div>
      </div>
    </motion.div>
  )
}

export function FeatureBento() {
  const gridRef = useRef<HTMLDivElement>(null)
  const ctaRef = useRef<HTMLDivElement>(null)
  const [travelY, setTravelY] = useState(720)

  // 0 when CTA is in the bottom third → 1 when CTA is centered (cards done)
  const { scrollYProgress } = useScroll({
    target: ctaRef,
    offset: ["start 0.75", "center center"],
  })

  useEffect(() => {
    const measure = () => {
      const grid = gridRef.current
      const cta = ctaRef.current
      if (!grid || !cta) return
      const g = grid.getBoundingClientRect()
      const c = cta.getBoundingClientRect()
      // From grid top down into the CTA body
      setTravelY(c.top - g.top + c.height * 0.45)
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])

  return (
    <section className="relative bg-[oklch(0.96_0.008_236)] dark:bg-[oklch(0.14_0.01_250)]">
      <div className="mx-auto w-full max-w-7xl px-6 pt-16 md:px-8 md:pt-20">
        <div
          ref={gridRef}
          className="relative z-10 mx-auto grid max-w-none grid-cols-1 gap-4 overflow-visible md:auto-rows-[17rem] md:grid-cols-3"
        >
          {items.map((item) => (
            <FlyingBentoCard
              key={item.title}
              item={item}
              progress={scrollYProgress}
              travelY={travelY}
            />
          ))}
        </div>

        <div ref={ctaRef} className="relative z-20 mt-32 md:mt-48 lg:mt-56">
          <CtaDashedGrid />
        </div>

        <div className="relative z-20 mt-20 md:mt-28">
          <FaqAccordion />
        </div>
      </div>
    </section>
  )
}
