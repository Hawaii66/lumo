import { z } from "zod"

export const createRoomSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(""),
})

export const chatMessageSchema = z.object({
  body: z.string().min(1),
  latex: z.string().optional(),
})

export type CreateRoomInput = z.infer<typeof createRoomSchema>
export type ChatMessageInput = z.infer<typeof chatMessageSchema>
