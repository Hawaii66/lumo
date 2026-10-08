import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { pageRangeValidator, segmentValidator } from "./lib/segments";

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
  problems: defineTable({
    pdfHash: v.string(),
    problemNumber: v.string(),
    questionRaw: v.string(),
    answerRaw: v.optional(v.string()),
    segments: v.array(segmentValidator),
    answerSegments: v.optional(v.array(segmentValidator)),
    /** Original 1-based page in the source PDF where the question appears. */
    sourcePage: v.optional(v.number()),
    fileId: v.id("files"),
    roomId: v.id("rooms"),
    status: v.union(
      v.literal("pending"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    error: v.optional(v.string()),
  })
    .index("by_pdfHash_and_number", ["pdfHash", "problemNumber"])
    .index("by_room", ["roomId"])
    .index("by_pdfHash_and_sourcePage", ["pdfHash", "sourcePage"]),
  parseJobs: defineTable({
    roomId: v.id("rooms"),
    fileId: v.id("files"),
    mergedStorageId: v.id("_storage"),
    pdfHash: v.optional(v.string()),
    pageRanges: v.array(pageRangeValidator),
    workflowId: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("hashing"),
      v.literal("extracting"),
      v.literal("converting"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    error: v.optional(v.string()),
    createdBy: v.id("users"),
    problemCount: v.optional(v.number()),
    skippedCount: v.optional(v.number()),
    skippedPageCount: v.optional(v.number()),
  })
    .index("by_room", ["roomId"])
    .index("by_file", ["fileId"]),
  /** Pages fully parsed for a given PDF content hash — skipped on future jobs. */
  parsedPages: defineTable({
    pdfHash: v.string(),
    pageNumber: v.number(),
  })
    .index("by_pdfHash_and_page", ["pdfHash", "pageNumber"])
    .index("by_pdfHash", ["pdfHash"]),
});
