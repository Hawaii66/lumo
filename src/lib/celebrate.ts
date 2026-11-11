import confetti from "canvas-confetti"

const COLORS = ["#059669", "#34d399", "#fbbf24", "#60a5fa", "#f472b6"]

/** Burst from a normalized viewport point (e.g. a clicked button). */
export function celebrateFromPoint(originX: number, originY: number) {
  void confetti({
    particleCount: 90,
    spread: 70,
    startVelocity: 35,
    origin: { x: originX, y: originY },
    colors: COLORS,
    disableForReducedMotion: true,
  })
}

/** Center-screen burst for async success (e.g. phone upload landed). */
export function celebrateSuccess() {
  void confetti({
    particleCount: 120,
    spread: 80,
    startVelocity: 40,
    origin: { x: 0.5, y: 0.65 },
    colors: COLORS,
    disableForReducedMotion: true,
  })
}
