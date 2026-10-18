import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { lumoStaticDocumentValidator } from "./lib/lumoContent";

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),
  rooms: defineTable({
    name: v.string(),
    description: v.string(),
  }).index("by_name", ["name"]),
  files: defineTable({
    roomId: v.id("rooms"),
    name: v.string(),
    storageId: v.id("_storage"),
    /** SHA-256 from Convex storage metadata, set on upload. */
    contentHash: v.string(),
  }).index("by_room", ["roomId"]),
  scanSessions: defineTable({
    token: v.string(),
    roomId: v.id("rooms"),
    createdBy: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("expired"),
    ),
    expiresAt: v.number(),
    fileId: v.optional(v.id("files")),
  })
    .index("by_token", ["token"])
    .index("by_createdBy", ["createdBy"]),
  roomMembers: defineTable({
    roomId: v.id("rooms"),
    userId: v.id("users"),
  })
    .index("by_room", ["roomId"])
    .index("by_user", ["userId"])
    .index("by_user_and_room", ["userId", "roomId"]),
  roomThreads: defineTable({
    roomId: v.id("rooms"),
    threadId: v.string(),
    title: v.string(),
    createdBy: v.id("users"),
  })
    .index("by_room", ["roomId"])
    .index("by_thread", ["threadId"]),
  /** Cached MinerU middle_json keyed by SHA-256 of PDF bytes. */
  mineruCache: defineTable({
    contentHash: v.string(),
    middleJsonStorageId: v.id("_storage"),
  }).index("by_contentHash", ["contentHash"]),
  /** One Lumo-parsed problem per row, keyed by content hash of PDF bytes. */
  problems: defineTable({
    contentHash: v.string(),
    row: v.number(),
    problemNumber: v.string(),
    problem: lumoStaticDocumentValidator,
    answer: lumoStaticDocumentValidator,
  }).index("by_contentHash_and_row", ["contentHash", "row"]),
  /**
   * Async PDF → problems parse jobs.
   * `statusUpdates` is a short progress log the workflow appends to.
   */
  pdfParseJobs: defineTable({
    fileId: v.id("files"),
    roomId: v.id("rooms"),
    contentHash: v.string(),
    createdBy: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("done"),
      v.literal("failed"),
    ),
    statusUpdates: v.array(
      v.object({
        message: v.string(),
        at: v.number(),
      }),
    ),
    error: v.optional(v.string()),
    problemCount: v.optional(v.number()),
  })
    .index("by_file", ["fileId"])
    .index("by_contentHash", ["contentHash"])
    .index("by_room", ["roomId"]),
});
