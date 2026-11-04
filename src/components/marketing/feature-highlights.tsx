import { motion, useInView } from "motion/react"
import { useRef } from "react"
import { cn } from "~/lib/utils"

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

function LaptopIllustration({ active }: { active: boolean }) {
  return (
    <div className="relative mx-auto flex h-44 w-full max-w-[280px] items-end justify-center">
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
        <div className="rounded-t-lg border border-neutral-700 bg-neutral-950 p-1.5 shadow-xl">
          <div className="relative aspect-[16/10] overflow-hidden rounded-md bg-neutral-900">
            <motion.div
              initial={false}
              animate={{ opacity: active ? 1 : 0 }}
              transition={{ duration: 0.45, delay: active ? 0.15 : 0 }}
              className="absolute inset-0 space-y-2 p-3"
            >
              <div className="h-2 w-1/3 rounded bg-primary/80" />
              <div className="h-1.5 w-2/3 rounded bg-neutral-600" />
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                <div className="h-10 rounded bg-neutral-800" />
                <div className="h-10 rounded bg-neutral-800" />
                <div className="h-10 rounded bg-primary/25" />
              </div>
              <div className="h-1.5 w-full rounded bg-neutral-700" />
              <div className="h-1.5 w-4/5 rounded bg-neutral-700" />
            </motion.div>
          </div>
        </div>
        <div className="mx-auto h-2 w-[108%] -translate-x-[4%] rounded-b-md border border-t-0 border-neutral-700 bg-neutral-800" />
        <div className="mx-auto h-1 w-1/3 rounded-b bg-neutral-700" />
      </motion.div>
    </div>
  )
}

function PhoneIllustration({ active }: { active: boolean }) {
  return (
    <div className="relative mx-auto flex h-44 items-center justify-center">
      <motion.div
        initial={false}
        animate={{
          y: active ? 0 : 16,
          opacity: active ? 1 : 0.55,
          scale: active ? 1 : 0.96,
        }}
        transition={{ type: "spring", stiffness: 140, damping: 18 }}
        className="h-40 w-[72px] rounded-[1.1rem] border border-neutral-700 bg-neutral-950 p-1 shadow-xl"
      >
        <div className="relative h-full overflow-hidden rounded-[0.85rem] bg-neutral-900">
          <div className="absolute top-1 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-neutral-800" />
          <motion.div
            initial={false}
            animate={{ opacity: active ? 1 : 0 }}
            transition={{ duration: 0.4, delay: active ? 0.12 : 0 }}
            className="absolute inset-x-1.5 top-4 space-y-1.5"
          >
            <div className="mx-auto flex size-8 items-center justify-center rounded-lg border border-dashed border-primary/50 bg-primary/10">
              <div className="size-4 rounded-sm border border-primary/70" />
            </div>
            <div className="h-1.5 rounded bg-neutral-600" />
            <div className="h-1.5 w-3/4 rounded bg-neutral-700" />
            <div className="mt-2 space-y-1">
              <div className="h-6 rounded bg-neutral-800" />
              <div className="h-6 rounded bg-neutral-800" />
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}

function TabletIllustration({ active }: { active: boolean }) {
  return (
    <div className="relative mx-auto flex h-44 w-full max-w-[220px] items-center justify-center">
      <motion.div
        initial={false}
        animate={{
          x: active ? 0 : 24,
          opacity: active ? 1 : 0.5,
        }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
        className="h-36 w-full rounded-2xl border border-neutral-700 bg-neutral-950 p-1.5 shadow-xl"
      >
        <div className="relative h-full overflow-hidden rounded-xl bg-neutral-900">
          <motion.div
            initial={false}
            animate={{ opacity: active ? 1 : 0 }}
            transition={{ duration: 0.45, delay: active ? 0.15 : 0 }}
            className="absolute inset-0 space-y-2 p-3"
          >
            <div className="flex items-center justify-between">
              <div className="h-2 w-1/2 rounded bg-primary/70" />
              <div className="h-5 w-12 rounded-md bg-primary/30" />
            </div>
            <div className="space-y-1.5 pt-1">
              <div className="h-8 rounded-lg bg-neutral-800" />
              <div className="h-8 rounded-lg bg-neutral-800" />
              <div className="h-8 rounded-lg border border-primary/30 bg-primary/10" />
            </div>
          </motion.div>
        </div>
      </motion.div>
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

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.5, delay: index * 0.08 }}
      className={cn(
        "flex flex-col rounded-3xl border border-neutral-800 bg-neutral-950/80 p-6",
      )}
    >
      <div className="mb-6">
        {device === "laptop" ? (
          <LaptopIllustration active={inView} />
        ) : device === "phone" ? (
          <PhoneIllustration active={inView} />
        ) : (
          <TabletIllustration active={inView} />
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
    <section className="bg-[oklch(0.14_0.01_250)] px-6 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
            AI-plugg gjort rätt
          </h2>
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
