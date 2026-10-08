import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    chatgptRefreshToken: v.optional(v.string()),
    chatgptAccessToken: v.optional(v.string()),
    accessTokenExpiresAt: v.optional(v.number()),
  }).index("by_email", ["email"]),

  rooms: defineTable({
    name: v.string(),
    description: v.string(),
    ownerId: v.id("users"),
    isTemplate: v.boolean(),
    originalTemplateId: v.optional(v.id("rooms")),
  }),

  documents: defineTable({
    roomId: v.id("rooms"),
    title: v.string(),
    storageId: v.string(),
  }).index("by_room", ["roomId"]),

  documentChunks: defineTable({
    documentId: v.id("documents"),
    text: v.string(),
    embedding: v.array(v.float64()),
  }).vectorIndex("by_embedding", {
    vectorField: "embedding",
    dimensions: 1536,
  }),

  threads: defineTable({
    roomId: v.id("rooms"),
    userId: v.id("users"),
    title: v.string(),
  }).index("by_room", ["roomId"]),

  messages: defineTable({
    threadId: v.id("threads"),
    sender: v.union(v.literal("user"), v.literal("ai")),
    body: v.string(),
    imageStorageId: v.optional(v.string()),
    helpLevel: v.optional(
      v.union(v.literal("minimal"), v.literal("explain"), v.literal("solve")),
    ),
  }).index("by_thread", ["threadId"]),

  scanSessions: defineTable({
    roomId: v.id("rooms"),
    status: v.union(
      v.literal("pending"),
      v.literal("scanned"),
      v.literal("expired"),
    ),
    imageStorageId: v.optional(v.string()),
  }),
});
