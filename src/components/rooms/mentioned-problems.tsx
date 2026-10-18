import { useQuery } from "convex/react"
import { useMemo, type ReactNode } from "react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { ParsedProblemView } from "~/components/lumo/parsed-problem"
import {
  resolveDraftMentions,
  type ProblemMentionOption,
  type ResolvedDraftMention,
} from "~/lib/chat-composer"
import { cn } from "~/lib/utils"

export type MentionedProblemsProps = {
  roomId: Id<"rooms">
  /** Pre-resolved draft mentions, or omit and pass `text` + options. */
  mentions?: Array<ResolvedDraftMention>
  text?: string
  problemOptions?: Array<ProblemMentionOption>
  /** Dim draft embeds that are not sent yet. */
  draft?: boolean
  className?: string
}

function ProblemChatBubble({
  fileName,
  problemNumber,
  children,
  draft,
}: {
  fileName?: string
  problemNumber: string
  children: ReactNode
  draft?: boolean
}) {
  return (
    <li
      className={cn(
        "max-w-[85%] rounded-lg px-3 py-2 text-sm bg-muted text-foreground",
        draft && "opacity-90 ring-1 ring-dashed ring-border",
      )}
    >
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Uppgift {problemNumber}
        {fileName ? ` · ${fileName}` : ""}
        {draft ? " · utkast" : ""}
      </p>
      {children}
    </li>
  )
}

/** Renders @mentioned problems as chat bubbles (draft or persisted). */
export function MentionedProblems({
  roomId,
  mentions: mentionsProp,
  text,
  problemOptions = [],
  draft = false,
  className,
}: MentionedProblemsProps) {
  const mentions = useMemo(() => {
    if (mentionsProp) return mentionsProp
    if (text) return resolveDraftMentions(text, problemOptions)
    return []
  }, [mentionsProp, text, problemOptions])

  const resolvedIds = useMemo(
    () =>
      mentions
        .filter(
          (m): m is Extract<ResolvedDraftMention, { status: "resolved" }> =>
            m.status === "resolved",
        )
        .map((m) => m.problemId as Id<"problems">),
    [mentions],
  )

  const problems = useQuery(
    api.PDFParse.problems.getManyForRoom,
    resolvedIds.length > 0 ? { roomId, problemIds: resolvedIds } : "skip",
  )

  const problemById = useMemo(() => {
    const map = new Map<string, NonNullable<typeof problems>[number]>()
    for (const problem of problems ?? []) {
      map.set(problem.id, problem)
    }
    return map
  }, [problems])

  if (mentions.length === 0) return null

  return (
    <div className={cn("contents", className)}>
      {mentions.map((mention) => {
        if (mention.status === "missing") {
          return (
            <ProblemChatBubble
              key={`missing-${mention.problemNumber}`}
              problemNumber={mention.problemNumber}
              draft={draft}
            >
              <p className="text-muted-foreground">
                Ingen uppgift matchar @{mention.problemNumber}
              </p>
            </ProblemChatBubble>
          )
        }
        if (mention.status === "ambiguous") {
          return (
            <ProblemChatBubble
              key={`ambiguous-${mention.problemNumber}`}
              problemNumber={mention.problemNumber}
              draft={draft}
            >
              <p className="text-muted-foreground">
                Flera uppgifter heter {mention.problemNumber} — välj fil i
                listan (@).
              </p>
            </ProblemChatBubble>
          )
        }

        const loaded = problemById.get(mention.problemId)
        return (
          <ProblemChatBubble
            key={mention.problemId}
            problemNumber={mention.problemNumber}
            fileName={loaded?.fileName ?? mention.fileName}
            draft={draft}
          >
            {problems === undefined && !loaded ? (
              <p className="text-muted-foreground">Hämtar uppgift…</p>
            ) : loaded ? (
              <ParsedProblemView
                problem={loaded.problem}
                showAnswer={false}
                className="text-sm [&_h2]:text-base"
              />
            ) : (
              <p className="text-muted-foreground">Uppgiften hittades inte.</p>
            )}
          </ProblemChatBubble>
        )
      })}
    </div>
  )
}
