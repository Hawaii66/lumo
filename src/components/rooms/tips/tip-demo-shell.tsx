import type { ReactNode } from "react"
import { cn } from "~/lib/utils"

/** Dotted-grid shell matching marketing bento headers (local copy). */
export function TipDemoShell({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative flex h-full min-h-[7.5rem] w-full flex-1 items-center justify-center overflow-hidden rounded-lg bg-neutral-100 bg-grid-white px-4 py-3 dark:bg-neutral-950",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-neutral-100 [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)] dark:bg-neutral-950"
      />
      <div className="relative z-10 flex h-full w-full min-h-0 flex-1 items-center justify-center">
        {children}
      </div>
    </div>
  )
}
