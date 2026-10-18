import { StaticMath } from "~/components/lumo/static-math"
import { splitTextWithInlineMath } from "~/lib/chat-composer"
import { cn } from "~/lib/utils"

type UserMessageTextProps = {
  text: string
  className?: string
}

/** Render user prompt text with `$latex$` segments as MathLive. */
export function UserMessageText({ text, className }: UserMessageTextProps) {
  const segments = splitTextWithInlineMath(text)

  return (
    <div className={cn("whitespace-pre-wrap", className)}>
      {segments.map((segment, index) => {
        if (segment.type === "math") {
          return (
            <StaticMath
              key={`math-${index}`}
              latex={segment.value}
              display="block"
              className="my-1 rounded-md bg-background/15 px-2 py-1 text-inherit"
            />
          )
        }
        if (!segment.value) return null
        return <span key={`text-${index}`}>{segment.value}</span>
      })}
    </div>
  )
}
