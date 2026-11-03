import type { Id } from "../../../../convex/_generated/dataModel"
import type { ChatMode } from "~/lib/chat-mode"

export type ChatInputImage = {
  id: string
  file: File
  previewUrl: string
}

export type ChatInputStorageImage = {
  id: string
  storageId: Id<"_storage">
  filename: string
}

export type ChatInputSubmitPayload = {
  prompt: string
  images: Array<ChatInputImage>
  storageImages?: Array<{ storageId: Id<"_storage">; filename: string }>
  /** Set when starting a chat from a problem action button. */
  mode?: ChatMode
  problemId?: Id<"problems">
  problemIds?: Array<Id<"problems">>
  /** Scope agent context to this deluppgift for the submitted turn. */
  subproblemLetter?: string
}

export type ChatStartDraft = {
  prompt: string
  mode: ChatMode
  storageImages?: Array<{ storageId: Id<"_storage">; filename: string }>
  subproblemLetter?: string
}

export type ChatInputCitation = {
  responseNumber: number
  text?: string
  latex?: string
}

export type ChatInputHandle = {
  /**
   * Prepend an auto-generated start prompt, append any text/images already in
   * the composer, and submit immediately with a chat mode.
   */
  submitStartDraft: (draft: ChatStartDraft) => Promise<void>
  /** Insert a citation from an assistant message into the composer. */
  insertCitation: (citation: ChatInputCitation) => void
}

/** Shape from `listGroupedByRoom` — pass from the room page; do not re-subscribe. */
export type RoomProblemGroup = {
  fileId: Id<"files">
  fileName: string
  problems: Array<{
    id: Id<"problems">
    problemNumber: string
    starEntries: Array<{ letter: string; stars: 1 | 2 | 3 }>
    completionEntries: Array<{ letter: string }>
    shadows: Array<{ id: Id<"problems">; problemNumber: string }>
  }>
}
