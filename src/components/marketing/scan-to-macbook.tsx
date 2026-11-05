import { useRef } from "react"
import {
  motion,
  useMotionTemplate,
  useScroll,
  useTransform,
} from "motion/react"

/** Inline worksheet used on the paper and as a square in the dashboard. */
export const WORKSHEET_SRC = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
  <rect width="1280" height="800" fill="#f4f1ea"/>
  <g stroke="#d6d0c4" stroke-width="1">
    ${Array.from({ length: 18 }, (_, i) => `<line x1="64" y1="${90 + i * 36}" x2="1216" y2="${90 + i * 36}" />`).join("")}
  </g>
  <text x="80" y="70" font-family="Georgia, serif" font-size="28" fill="#2a2a2a">Uppgift 3.2</text>
  <text x="80" y="140" font-family="Georgia, serif" font-size="22" fill="#333">Bestäm alla reella x som uppfyller</text>
  <text x="80" y="200" font-family="Georgia, serif" font-size="26" fill="#1a1a1a">x + √(1 − 4x) = 1</text>
  <path d="M90 280 C 140 250, 180 320, 230 290 S 320 250, 380 300" fill="none" stroke="#e8590c" stroke-width="3" stroke-linecap="round"/>
  <text x="90" y="360" font-family="Georgia, serif" font-size="20" fill="#555">försök: isolera roten…</text>
  <text x="90" y="420" font-family="Georgia, serif" font-size="22" fill="#222">√(1 − 4x) = 1 − x</text>
  <rect x="980" y="560" width="180" height="180" fill="#fff" stroke="#222" stroke-width="4"/>
  <g fill="#111">
    <rect x="1000" y="580" width="28" height="28"/>
    <rect x="1040" y="580" width="28" height="28"/>
    <rect x="1080" y="580" width="28" height="28"/>
    <rect x="1120" y="580" width="28" height="28"/>
    <rect x="1000" y="620" width="28" height="28"/>
    <rect x="1080" y="620" width="28" height="28"/>
    <rect x="1120" y="620" width="28" height="28"/>
    <rect x="1000" y="660" width="28" height="28"/>
    <rect x="1040" y="660" width="28" height="28"/>
    <rect x="1120" y="660" width="28" height="28"/>
    <rect x="1000" y="700" width="28" height="28"/>
    <rect x="1040" y="700" width="28" height="28"/>
    <rect x="1080" y="700" width="28" height="28"/>
    <rect x="1120" y="700" width="28" height="28"/>
  </g>
  <text x="980" y="770" font-family="ui-sans-serif, system-ui" font-size="16" fill="#666">Lumo scan</text>
</svg>
`)}`

/**
 * Scroll story:
 * 1. Phone slides in from left onto paper
 * 2. Soft flash
 * 3. Phone exits right; computer rises; paper moves down into the computer
 * 4. Dashboard comes out with worksheet as a square card
 */
export function ScanToMacbook() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  })

  const titleOpacity = useTransform(scrollYProgress, [0, 0.12, 0.22], [1, 1, 0])
  const titleY = useTransform(scrollYProgress, [0, 0.22], [0, -40])
  const hintOpacity = useTransform(scrollYProgress, [0, 0.08, 0.18], [0.65, 0.65, 0])

  // Soft flash once phone is centered on the paper
  const flashOpacity = useTransform(
    scrollYProgress,
    [0.22, 0.25, 0.3],
    [0, 0.28, 0],
  )

  // Paper stays put until phone is gone, then moves down into the computer
  const deskOpacity = useTransform(
    scrollYProgress,
    [0, 0.42, 0.58, 0.68],
    [1, 1, 0.5, 0],
  )
  const deskY = useTransform(scrollYProgress, [0, 0.4, 0.42, 0.65], [0, 0, 20, 220])
  const deskScale = useTransform(scrollYProgress, [0.42, 0.65], [1, 0.38])
  const deskRotate = useTransform(scrollYProgress, [0.42, 0.6], [-3, 0])
  const deskZ = useTransform(scrollYProgress, [0, 0.45, 0.55], [15, 15, 5])

  // Phone: enter from left → hold on paper → flash → exit right (constant size)
  const phoneOpacity = useTransform(
    scrollYProgress,
    [0, 0.04, 0.28, 0.34, 0.4],
    [0, 1, 1, 0.55, 0],
  )
  const phoneX = useTransform(
    scrollYProgress,
    [0, 0.14, 0.22, 0.28, 0.38],
    [-380, 0, 0, 0, 440],
  )
  const phoneRotate = useTransform(
    scrollYProgress,
    [0, 0.14, 0.28, 0.38],
    [-12, 0, 0, 18],
  )

  // Laptop starts lower in frame with room under the paper, then rises
  const laptopY = useTransform(
    scrollYProgress,
    [0, 0.2, 0.45, 0.75],
    [160, 140, 40, -36],
  )
  const laptopOpacity = useTransform(scrollYProgress, [0, 0.08, 0.2], [0.55, 0.7, 1])
  const laptopScale = useTransform(scrollYProgress, [0, 0.25, 0.7], [0.78, 0.82, 1])

  const lidRotate = useTransform(
    scrollYProgress,
    [0.4, 0.55, 0.72],
    [-28, -12, 0],
  )
  const screenScaleX = useTransform(scrollYProgress, [0.45, 0.75], [1.05, 1.4])
  const screenScaleY = useTransform(scrollYProgress, [0.45, 0.75], [0.72, 1.4])
  const dashboardOut = useTransform(scrollYProgress, [0.55, 0.85], [0, -260])
  const dashboardOpacity = useTransform(
    scrollYProgress,
    [0.5, 0.58, 0.9],
    [0, 1, 1],
  )

  const glowAmount = useTransform(
    scrollYProgress,
    [0.22, 0.28, 0.4, 0.55],
    [0.06, 0.22, 0.12, 0.06],
  )
  const glow = useMotionTemplate`radial-gradient(ellipse 55% 40% at 50% 55%, rgba(249,115,22,${glowAmount}), transparent)`

  return (
    <section
      ref={ref}
      className="relative h-[320vh] bg-[oklch(0.12_0.01_250)]"
    >
      <div className="sticky top-0 flex h-svh items-center justify-center overflow-hidden [perspective:1200px]">
        <motion.div
          style={{ backgroundImage: glow }}
          className="pointer-events-none absolute inset-0"
        />

        {/* Soft flash overlay */}
        <motion.div
          style={{ opacity: flashOpacity }}
          className="pointer-events-none absolute inset-0 z-50 bg-orange-100/80"
        />

        <motion.div
          style={{ opacity: titleOpacity, y: titleY }}
          className="absolute top-12 left-1/2 z-40 w-[min(92vw,40rem)] -translate-x-1/2 px-4 text-center"
        >
          <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Skanna med telefon
          </h2>
          <p className="mt-3 text-pretty text-sm text-neutral-400 md:text-base">
            Ladda upp ditt pågående arbete till AI via skanna-med-telefon, så den
            kan hjälpa dig där du kört fast eller hitta små slarvfel.
          </p>
        </motion.div>

        <motion.p
          style={{ opacity: hintOpacity }}
          className="absolute bottom-8 left-1/2 z-40 -translate-x-1/2 text-xs tracking-wide text-neutral-500 uppercase"
        >
          Scrolla
        </motion.p>

        <div className="relative h-full w-full max-w-5xl">
          {/* Paper + phone stacked — phone sits on the paper; space below for laptop */}
          <motion.div
            style={{
              opacity: deskOpacity,
              y: deskY,
              scale: deskScale,
              rotate: deskRotate,
              zIndex: deskZ,
            }}
            className="absolute top-[22%] left-1/2 w-[min(68vw,380px)] -translate-x-1/2"
          >
            <div className="relative">
              <div className="rounded-sm bg-[#f4f1ea] p-3 shadow-[0_20px_50px_rgba(0,0,0,0.45)] ring-1 ring-black/10">
                <img
                  src={WORKSHEET_SRC}
                  alt=""
                  className="aspect-[4/3] w-full rounded-[2px] object-cover"
                  draggable={false}
                />
              </div>

              {/* Phone resting on top of the paper */}
              <motion.div
                style={{
                  opacity: phoneOpacity,
                  x: phoneX,
                  rotate: phoneRotate,
                }}
                className="absolute top-1/2 left-1/2 z-10 origin-center -translate-x-1/2 -translate-y-[42%]"
              >
                <div className="relative h-[200px] w-[100px] rotate-[-8deg] rounded-[1.35rem] border border-neutral-600 bg-neutral-950 p-1 shadow-2xl sm:h-[220px] sm:w-[110px]">
                  <div className="relative h-full overflow-hidden rounded-[1.05rem] bg-neutral-900">
                    <div className="absolute top-1.5 left-1/2 z-10 h-1 w-10 -translate-x-1/2 rounded-full bg-neutral-800" />
                    <img
                      src={WORKSHEET_SRC}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover opacity-90"
                      draggable={false}
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40" />
                    <div className="absolute inset-5 rounded-md border border-primary/80 shadow-[0_0_0_999px_rgba(0,0,0,0.22)]" />
                    <div className="absolute top-7 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] tracking-wide text-primary">
                      Skanna
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>

          {/* Laptop — starts in the space under the paper, then rises */}
          <motion.div
            style={{
              y: laptopY,
              opacity: laptopOpacity,
              scale: laptopScale,
            }}
            className="absolute bottom-[4%] left-1/2 z-20 w-[min(92vw,36rem)] -translate-x-1/2 [transform-style:preserve-3d]"
          >
            <div className="relative mx-auto w-full [perspective:900px]">
              <div
                className="relative mx-auto aspect-[16/10] w-full rounded-2xl bg-[#0a0a0a] p-2 shadow-2xl"
                style={{
                  transform: "rotateX(-18deg)",
                  transformOrigin: "bottom",
                  transformStyle: "preserve-3d",
                }}
              >
                <div className="flex h-full items-center justify-center rounded-xl bg-[#111]">
                  <span className="text-xs tracking-[0.3em] text-neutral-600 uppercase">
                    Lumo
                  </span>
                </div>
              </div>

              <motion.div
                style={{
                  rotateX: lidRotate,
                  scaleX: screenScaleX,
                  scaleY: screenScaleY,
                  y: dashboardOut,
                  opacity: dashboardOpacity,
                  transformOrigin: "top",
                  transformStyle: "preserve-3d",
                }}
                className="absolute inset-x-0 top-0 aspect-[16/10] w-full rounded-2xl bg-[#010101] p-2 shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
              >
                <div
                  className="relative flex h-full overflow-hidden rounded-xl bg-[#161618] [backface-visibility:hidden] [transform:translateZ(0)] [-webkit-font-smoothing:antialiased]"
                >
                  {/* Skeleton chat list */}
                  <div className="flex h-full w-[28%] flex-col gap-1.5 border-r border-white/5 bg-[#121214] p-2 sm:w-[26%]">
                    <div className="mb-1.5 leading-tight text-white">
                      <div className="text-[11px] font-semibold sm:text-[12px]">
                        TATB01
                      </div>
                      <div className="text-[10px] text-white/70 sm:text-[11px]">
                        Grunken
                      </div>
                    </div>
                    {[
                      "w-full",
                      "w-4/5",
                      "w-full",
                      "w-3/5",
                      "w-[90%]",
                      "w-2/3",
                      "w-4/5",
                    ].map((width, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1.5 rounded-md bg-white/[0.03] px-1.5 py-1.5"
                      >
                        <div className="size-2 shrink-0 rounded-full bg-white/10" />
                        <div
                          className={`h-1.5 rounded bg-white/10 ${width}`}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Main — user Q, paper square, AI answer */}
                  <div className="flex flex-1 flex-col [backface-visibility:hidden] [transform:translateZ(0)]">
                    <div className="flex h-7 items-center border-b border-white/5 px-3">
                      <span className="text-[11px] font-medium text-neutral-400">
                        Lumo
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col justify-center gap-2.5 bg-[#1c1c1f] px-3 py-2 sm:gap-3 sm:px-4">
                      <div className="max-w-[85%] self-end rounded-lg rounded-br-sm bg-primary/30 px-2.5 py-1.5 text-[12px] leading-snug font-medium text-white sm:text-[13px]">
                        Vad är fel?
                      </div>
                      <div className="aspect-square w-[48%] max-w-[180px] self-end overflow-hidden rounded-lg border border-white/10 bg-[#f4f1ea] shadow-lg">
                        <img
                          src={WORKSHEET_SRC}
                          alt=""
                          className="h-full w-full object-cover"
                          draggable={false}
                        />
                      </div>
                      <div className="max-w-[90%] self-start rounded-lg rounded-bl-sm bg-white/10 px-2.5 py-1.5 text-[12px] leading-snug font-medium text-neutral-100 sm:text-[13px]">
                        Saknar minustecken på rad 2
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

            <div className="relative mx-auto -mt-1 h-28 w-[98%] overflow-hidden rounded-b-2xl bg-[#272729] sm:h-36">
              <div className="mx-auto mt-2 h-3 w-[78%] rounded-sm bg-[#050505]" />
              <div className="mx-auto mt-3 h-14 w-[70%] rounded-md bg-[#0c0c0c] sm:h-20" />
              <div className="mx-auto mt-2 h-10 w-[38%] rounded-xl bg-[#1a1a1a] shadow-[inset_0_0_0_1px_#00000040]" />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
