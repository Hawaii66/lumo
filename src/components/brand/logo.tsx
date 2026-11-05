import { Link } from "@tanstack/react-router"
import { cn } from "~/lib/utils"

const sizeClasses = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-12 w-12",
  xl: "h-16 w-16",
} as const

const wordmarkClasses = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-2xl",
  xl: "text-4xl",
} as const

type LogoProps = {
  size?: keyof typeof sizeClasses
  showWordmark?: boolean
  className?: string
  wordmarkClassName?: string
  asLink?: boolean
}

export function Logo({
  size = "md",
  showWordmark = true,
  className,
  wordmarkClassName,
  asLink = false,
}: LogoProps) {
  const content = (
    <>
      <img
        src="/logo.png"
        alt=""
        width={64}
        height={64}
        className={cn(sizeClasses[size], "shrink-0 rounded-md object-cover")}
        decoding="async"
      />
      {showWordmark ? (
        <span
          className={cn(
            "font-semibold tracking-tight text-primary",
            wordmarkClasses[size],
            wordmarkClassName,
          )}
        >
          Lumo
        </span>
      ) : null}
    </>
  )

  const classes = cn("inline-flex items-center gap-2", className)

  if (asLink) {
    return (
      <Link to="/" className={classes} aria-label="Lumo startsida">
        {content}
      </Link>
    )
  }

  return (
    <span className={classes} aria-label="Lumo">
      {content}
    </span>
  )
}
