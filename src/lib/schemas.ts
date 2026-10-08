import { z } from "zod"

export const helpLevelSchema = z.enum(["minimal", "explain", "solve"])

export const createRoomSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(""),
  isTemplate: z.boolean().default(false),
})

export const chatMessageSchema = z.object({
  body: z.string().min(1),
  helpLevel: helpLevelSchema.optional(),
  latex: z.string().optional(),
})

export type CreateRoomInput = z.infer<typeof createRoomSchema>
export type ChatMessageInput = z.infer<typeof chatMessageSchema>
export type HelpLevel = z.infer<typeof helpLevelSchema>
