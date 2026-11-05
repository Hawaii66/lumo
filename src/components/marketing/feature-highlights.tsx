import { Link } from "@tanstack/react-router"
import { Copy, FileText, Lightbulb, ScanSearch } from "lucide-react"
import { motion, useInView } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { Button } from "~/components/ui/button"
import { FlipWords } from "~/components/ui/flip-words"
import { cn } from "~/lib/utils"

const heroFlipWords = ["rätt", "smart", "enkelt", "roligt"]

/** Top three: kursrum (+ instant setup), PDF → uppgifter, tvillinguppgifter. */
const features = [
  {
    title: "Kursrum",
    description:
      "Allt för en kurs på ett ställe: AI-chattar, PDF:er, bilder, uppgifter och tentor. Kopiera rum skapade av andra användare för instant setup.",
    device: "laptop" as const,
  },
  {
    title: "PDF → uppgifter",
    description:
      "Ladda upp PDF:er och extrahera uppgifter så att AI direkt förstår vilken uppgift du pratar om.",
    device: "phone" as const,
  },
  {
    title: "Tvillinguppgifter",
    description:
      "Skapa tvillinguppgifter där AI genererar en ny liknande uppgift så du kan öva mer på svåra problem.",
    device: "tablet" as const,
  },
]

/** Mini room UI: problem list | problem + Genomgång/Skanna | text input. */
function LaptopIllustration({ active }: { active: boolean }) {
  return (
    <div className="relative mx-auto flex h-44 w-full max-w-[210px] items-end justify-center">
      <motion.div
        initial={false}
        animate={{
          rotateX: active ? 0 : -28,
          y: active ? 0 : 8,
        }}
        transition={{ type: "spring", stiffness: 120, damping: 18 }}
        style={{ transformOrigin: "bottom center", transformPerspective: 800 }}
        className="w-full"
      >
        <div className="rounded-t-lg border border-neutral-700 bg-neutral-950 p-1 shadow-xl">
          <div className="relative aspect-[16/10] overflow-hidden rounded-md bg-neutral-900">
            <motion.div
              initial={false}
              animate={{ opacity: active ? 1 : 0 }}
              transition={{ duration: 0.45, delay: active ? 0.15 : 0 }}
              className="absolute inset-0 flex"
            >
              {/* Problem list */}
              <div className="flex w-[28%] shrink-0 flex-col gap-1 border-r border-neutral-800 bg-neutral-950 p-1.5">
                <div className="h-1.5 w-full rounded bg-neutral-700" />
                {["1", "2a", "2b", "3"].map((num, i) => (
                  <div
                    key={num}
                    className={cn(
                      "flex items-center rounded px-1 py-0.5",
                      i === 1 ? "bg-primary/25" : "bg-neutral-800/60",
                    )}
                  >
                    <span
                      className={cn(
                        "text-[7px] font-medium tabular-nums",
                        i === 1 ? "text-white" : "text-neutral-400",
                      )}
                    >
                      {num}
                    </span>
                  </div>
                ))}
              </div>

              {/* Main: problem + actions + text input */}
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="shrink-0 space-y-1 border-b border-neutral-800 px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    <span className="text-[8px] font-semibold text-neutral-200">
                      2a
                    </span>
                    <div className="h-1 flex-1 rounded bg-neutral-700" />
                  </div>
                  <div className="h-1 w-4/5 rounded bg-neutral-600" />
                  <div className="h-1 w-3/5 rounded bg-neutral-700" />
                </div>

                <div className="flex flex-1 items-center justify-center gap-1.5 px-2 py-1.5">
                  <div className="flex flex-1 flex-col items-center gap-0.5 rounded-md border border-primary/60 bg-primary/10 px-1 py-1.5 text-primary">
                    <Lightbulb className="size-2.5 stroke-[1.75]" />
                    <span className="text-[6px] font-semibold leading-none">
                      Genomgång
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col items-center gap-0.5 rounded-md border border-primary/60 bg-primary/10 px-1 py-1.5 text-primary">
                    <ScanSearch className="size-2.5 stroke-[1.75]" />
                    <span className="text-[6px] font-semibold leading-none">
                      Skanna
                    </span>
                  </div>
                </div>

                <div className="shrink-0 border-t border-neutral-800 px-1.5 py-1">
                  <div className="flex h-3.5 items-center rounded border border-neutral-700 bg-neutral-950 px-1.5">
                    <span className="truncate text-[6px] text-neutral-500">
                      Skriv ett meddelande…
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
        <div className="mx-auto h-1.5 w-[108%] -translate-x-[4%] rounded-b-md border border-t-0 border-neutral-700 bg-neutral-800" />
        <div className="mx-auto h-0.5 w-1/3 rounded-b bg-neutral-700" />
      </motion.div>
    </div>
  )
}

const TOLKA_TARGET = 34

/** PDF icon + Tolka; click swaps to a count-up. */
function PhoneIllustration({ active }: { active: boolean }) {
  const [started, setStarted] = useState(false)
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!started) {
      setCount(0)
      return
    }

    let frame = 0
    const durationMs = 1600
    const start = performance.now()

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - (1 - t) ** 2.4
      setCount(Math.round(eased * TOLKA_TARGET))
      if (t < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [started])

  return (
    <div className="relative mx-auto flex h-44 w-full max-w-[260px] items-center justify-center">
      <motion.div
        initial={false}
        animate={{
          y: active ? 0 : 16,
          opacity: active ? 1 : 0.55,
          scale: active ? 1 : 0.96,
        }}
        transition={{ type: "spring", stiffness: 140, damping: 18 }}
        className="flex w-full items-center justify-center gap-5"
      >
        <div
          aria-hidden
          className="flex size-24 shrink-0 items-center justify-center rounded-2xl border border-neutral-700 bg-neutral-900 text-neutral-200 shadow-sm"
        >
          <FileText className="size-12" />
        </div>

        <div className="relative flex h-14 min-w-[5.5rem] items-center justify-center">
          {!started ? (
            <motion.button
              type="button"
              aria-label="Tolka PDF"
              onClick={() => setStarted(true)}
              animate={
                active
                  ? { scale: [1, 1.05, 1], opacity: [1, 0.85, 1] }
                  : { scale: 1, opacity: 1 }
              }
              transition={
                active
                  ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" }
                  : { duration: 0.25 }
              }
              className="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm"
            >
              <ScanSearch className="size-4 shrink-0" />
              Tolka
            </motion.button>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25 }}
              className="text-center"
            >
              <p className="text-2xl font-semibold tracking-tight text-neutral-100 tabular-nums leading-none">
                {count}
              </p>
              <p className="mt-1 text-[10px] leading-tight text-neutral-400">
                tolkade uppgifter
              </p>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

/** Twin/clone: original problem card duplicates into a sibling. */
function TabletIllustration({ active }: { active: boolean }) {
  return (
    <div className="relative mx-auto flex h-44 w-full max-w-[280px] items-center justify-center">
      <div className="relative h-40 w-full">
        <motion.div
          initial={false}
          animate={{
            x: active ? -26 : 0,
            opacity: active ? 1 : 0.7,
          }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
          className="absolute top-3 left-1/2 z-10 w-[64%] -translate-x-1/2 rounded-xl border border-neutral-700 bg-neutral-950 p-3 shadow-xl"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-200">2a</span>
            <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[9px] text-neutral-400">
              Original
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="h-2 w-full rounded bg-neutral-700" />
            <div className="h-2 w-4/5 rounded bg-neutral-700" />
            <div className="h-2 w-3/5 rounded bg-neutral-800" />
          </div>
        </motion.div>

        <motion.div
          initial={false}
          animate={{
            x: active ? 26 : 0,
            y: active ? 14 : 0,
            opacity: active ? 1 : 0,
            scale: active ? 1 : 0.85,
          }}
          transition={{
            type: "spring",
            stiffness: 120,
            damping: 18,
            delay: active ? 0.12 : 0,
          }}
          className="absolute top-3 left-1/2 z-20 w-[64%] -translate-x-1/2 rounded-xl border border-primary/40 bg-neutral-950 p-3 shadow-xl"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-200">2a′</span>
            <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[9px] text-primary">
              Tvilling
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="h-2 w-full rounded bg-neutral-700" />
            <div className="h-2 w-[70%] rounded bg-primary/40" />
            <div className="h-2 w-3/5 rounded bg-neutral-800" />
          </div>
        </motion.div>

        <motion.div
          initial={false}
          animate={{
            opacity: active ? 1 : 0,
            scale: active ? 1 : 0.6,
          }}
          transition={{ duration: 0.35, delay: active ? 0.05 : 0 }}
          className="absolute top-1/2 left-1/2 z-30 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 text-primary shadow-md"
        >
          <Copy className="size-4" />
        </motion.div>
      </div>
    </div>
  )
}

function FeatureCard({
  title,
  description,
  device,
  index,
}: (typeof features)[number] & { index: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.45 })
  const enterDelay = 0.25 + index * 0.25
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!inView) return
    const timeout = window.setTimeout(() => setActive(true), enterDelay * 1000)
    return () => window.clearTimeout(timeout)
  }, [inView, enterDelay])

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.5, delay: enterDelay }}
      className={cn(
        "flex flex-col rounded-3xl border border-neutral-800 bg-neutral-950/80 p-6",
      )}
    >
      <div className="mb-6">
        {device === "laptop" ? (
          <LaptopIllustration active={active} />
        ) : device === "phone" ? (
          <PhoneIllustration active={active} />
        ) : (
          <TabletIllustration active={active} />
        )}
      </div>
      <h3 className="text-lg font-semibold tracking-tight text-white">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-neutral-400">
        {description}
      </p>
    </motion.div>
  )
}

export function FeatureHighlights() {
  return (
    <section className="relative overflow-hidden bg-[oklch(0.14_0.01_250)] bg-grid-white px-6 pt-6 pb-20 md:px-8 md:pt-8 md:pb-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[oklch(0.14_0.01_250)] [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]"
      />
      <header className="relative z-10 mx-auto mb-10 flex max-w-7xl items-center justify-between md:mb-14">
        <span className="text-lg font-semibold tracking-tight text-primary">
          Lumo
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-primary bg-transparent text-primary hover:bg-primary/10 hover:text-primary"
            render={<Link to="/signin" />}
          >
            Logga in
          </Button>
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            render={<Link to="/signup" />}
          >
            Skapa konto
          </Button>
        </div>
      </header>
      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <p className="mb-3 text-5xl font-semibold tracking-tight text-primary sm:text-6xl md:text-7xl">
            Lumo
          </p>
          <h1 className="text-balance text-2xl font-medium tracking-tight text-white/90 sm:text-3xl md:text-4xl">
            AI-plugg gjort{" "}
            <FlipWords
              words={heroFlipWords}
              className="px-1 text-primary"
            />
          </h1>
          <p className="mt-3 text-pretty text-neutral-400 md:text-lg">
            Skapa rum för varje kurs där allt som hör till kursen samlas —
            AI-chattar, PDF:er, bilder, uppgifter, tentor.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
          {features.map((feature, index) => (
            <FeatureCard key={feature.title} {...feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  )
}
