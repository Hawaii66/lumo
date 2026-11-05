import { useRef } from "react"
import {
  motion,
  useMotionTemplate,
  useScroll,
  useTransform,
} from "motion/react"

/** 4:3 worksheet: blurry header / question / solution, mostly-straight broken lines. */
export const WORKSHEET_SRC = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <defs>
    <filter id="soft" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="1.6"/>
    </filter>
    <filter id="heavy" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="2.6"/>
    </filter>
  </defs>
  <rect width="1200" height="900" fill="#f4f1ea"/>
  <g stroke="#d6d0c4" stroke-width="1">
    ${Array.from({ length: 20 }, (_, i) => `<line x1="72" y1="${96 + i * 36}" x2="1128" y2="${96 + i * 36}" />`).join("")}
  </g>

  <!-- Problem header -->
  <g filter="url(#soft)" fill="#2a2a2a" font-family="Georgia, serif">
    <text x="96" y="78" font-size="28" font-weight="700">Uppgift 3.2</text>
  </g>

  <!-- Question -->
  <g filter="url(#soft)" fill="#444" font-family="Georgia, serif" font-size="18">
    <text x="96" y="130">Fråga</text>
  </g>
  <g filter="url(#heavy)" fill="none" stroke="#333" stroke-width="2.6" stroke-linecap="round">
    <path d="M96 168 C 140 162, 190 174, 240 166"/>
    <path d="M275 166 C 330 172, 390 160, 450 168"/>
    <path d="M485 168 C 540 162, 595 174, 650 166"/>
    <path d="M96 210 C 130 216, 170 204, 210 212"/>
    <path d="M245 211 C 295 205, 350 217, 410 209"/>
    <path d="M445 210 C 495 216, 550 204, 600 212"/>
    <path d="M635 212 C 680 206, 730 218, 780 210"/>
    <path d="M96 252 C 155 246, 215 258, 280 250"/>
    <path d="M315 251 C 375 257, 440 245, 510 253"/>
  </g>

  <!-- Solution -->
  <g filter="url(#soft)" fill="#555" font-family="Georgia, serif" font-size="18">
    <text x="96" y="330">Lösning</text>
  </g>
  <g filter="url(#heavy)" fill="none" stroke="#333" stroke-width="2.5" stroke-linecap="round">
    <path d="M96 372 C 140 366, 185 378, 230 370"/>
    <path d="M265 371 C 315 377, 370 365, 430 373"/>
    <path d="M465 372 C 515 366, 565 378, 620 370"/>
    <path d="M96 414 C 125 420, 155 408, 190 416"/>
    <path d="M225 415 C 270 409, 320 421, 370 413"/>
    <path d="M405 414 C 455 420, 505 408, 560 416"/>
    <path d="M595 416 C 645 410, 695 422, 750 414"/>
    <path d="M96 456 C 150 450, 210 462, 270 454"/>
    <path d="M305 455 C 360 461, 420 449, 480 457"/>
    <path d="M515 456 C 565 450, 620 462, 680 454"/>
    <path d="M96 498 C 135 504, 175 492, 220 500"/>
    <path d="M255 499 C 305 493, 360 505, 420 497"/>
    <path d="M455 498 C 510 504, 570 492, 630 500"/>
    <path d="M96 540 C 160 534, 230 546, 300 538"/>
    <path d="M335 539 C 395 545, 460 533, 530 541"/>
    <path d="M96 582 C 130 588, 165 576, 200 584"/>
    <path d="M235 583 C 285 577, 340 589, 400 581"/>
    <path d="M435 582 C 485 588, 540 576, 600 584"/>
    <path d="M96 624 C 145 618, 200 630, 260 622"/>
    <path d="M295 623 C 345 629, 400 617, 460 625"/>
    <path d="M495 624 C 545 618, 600 630, 660 622"/>
    <path d="M96 666 C 135 672, 175 660, 220 668"/>
    <path d="M255 667 C 310 661, 370 673, 430 665"/>
    <path d="M96 708 C 155 702, 215 714, 280 706"/>
    <path d="M315 707 C 370 713, 430 701, 500 709"/>
  </g>
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
  // Capture button squish (both axes) during flash
  const captureScale = useTransform(
    scrollYProgress,
    [0.22, 0.25, 0.3],
    [1, 0.62, 1],
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
                  className="aspect-[4/3] w-full rounded-[2px] object-contain"
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
                  <div className="relative h-full overflow-hidden rounded-[1.05rem] bg-white">
                    <div className="absolute top-1.5 left-1/2 z-10 h-1 w-10 -translate-x-1/2 rounded-full bg-neutral-300" />
                    {/* Larger QR frame, higher up; subtle orange pulse */}
                    <div className="absolute top-[18%] left-1/2 size-[68px] -translate-x-1/2 sm:size-[74px]">
                      <motion.span
                        className="absolute -inset-1 rounded-md border border-primary/50"
                        animate={{
                          scale: [1, 1.08, 1],
                          opacity: [0.35, 0.7, 0.35],
                        }}
                        transition={{
                          duration: 1.4,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                      />
                      <span className="absolute inset-0 rounded-md border-2 border-primary" />
                      <span className="absolute top-0 left-0 size-3.5 border-t-2 border-l-2 border-primary" />
                      <span className="absolute top-0 right-0 size-3.5 border-t-2 border-r-2 border-primary" />
                      <span className="absolute bottom-0 left-0 size-3.5 border-b-2 border-l-2 border-primary" />
                      <span className="absolute right-0 bottom-0 size-3.5 border-b-2 border-r-2 border-primary" />
                    </div>
                    {/* Capture shutter — squish on flash */}
                    <motion.div
                      style={{ scale: captureScale }}
                      className="absolute bottom-3 left-1/2 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border-[2.5px] border-neutral-800 bg-white sm:size-10"
                    >
                      <div className="size-6 rounded-full bg-neutral-800 sm:size-7" />
                    </motion.div>
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
                      <div className="aspect-[4/3] w-[55%] max-w-[200px] self-end overflow-hidden rounded-lg border border-white/10 bg-[#f4f1ea] shadow-lg">
                        <img
                          src={WORKSHEET_SRC}
                          alt=""
                          className="h-full w-full object-contain"
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
