import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  chatDeletionExpiryValidator,
  chatModeValidator,
} from "./lib/lumoContent";

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
    /**
     * Freeform notes for the AI about this room (preferred methods, context, etc.).
     * Missing on older rooms → treat as empty. Injected into chat system prompts.
     */
    generalInfo: v.optional(v.string()),
    /** Set on create/clone; missing on older rooms. */
    createdBy: v.optional(v.id("users")),
    /** Set when this room was cloned from a template; missing otherwise. */
    clonedFromTemplateId: v.optional(v.id("roomTemplates")),
  }).index("by_name", ["name"]),
  files: defineTable({
    roomId: v.id("rooms"),
    name: v.string(),
    storageId: v.id("_storage"),
    /** SHA-256 from Convex storage metadata, set on upload. */
    contentHash: v.string(),
  })
    .index("by_room", ["roomId"])
    .index("by_storageId", ["storageId"]),
  /**
   * Published snapshot of a room for others to clone.
   * Clones never sync; expire optionally points at a replacement template.
   */
  roomTemplates: defineTable({
    sourceRoomId: v.id("rooms"),
    publisherId: v.id("users"),
    name: v.string(),
    description: v.string(),
    generalInfo: v.string(),
    status: v.union(v.literal("published"), v.literal("expired")),
    publishedAt: v.number(),
    /** Set when expiring; banner CTA clones this template. */
    replacementTemplateId: v.optional(v.id("roomTemplates")),
  })
    .index("by_status", ["status"])
    .index("by_sourceRoom", ["sourceRoomId"])
    .index("by_publisher", ["publisherId"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["status"],
    }),
  roomTemplateFiles: defineTable({
    templateId: v.id("roomTemplates"),
    name: v.string(),
    storageId: v.id("_storage"),
    contentHash: v.string(),
  })
    .index("by_template", ["templateId"])
    .index("by_storageId", ["storageId"]),
  roomTemplateInfoCells: defineTable({
    templateId: v.id("roomTemplates"),
    contentHash: v.string(),
  }).index("by_template", ["templateId"]),
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
    .index("by_createdBy", ["createdBy"])
    .index("by_room", ["roomId"]),
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
    /** Interaction mode for the chat. Missing on older threads → treat as normal. */
    mode: v.optional(chatModeValidator),
    /**
     * Auto-archive preference. Missing on older threads → infinite.
     * `deleteAt` is the absolute archive deadline when not infinite; cron archives.
     */
    deletionExpiry: v.optional(chatDeletionExpiryValidator),
    deleteAt: v.optional(v.number()),
    /**
     * Set when the chat is archived (manual or expiry). Missing → active.
     * Cleared on unarchive. Soft-delete: messages are kept.
     */
    archivedAt: v.optional(v.number()),
    /**
     * Distinct @-mentioned problem tokens (`{number}-{fileSlug}`) in display
     * order. Updated as messages are sent; missing on older threads.
     */
    mentionedProblemNumbers: v.optional(v.array(v.string())),
  })
    .index("by_room", ["roomId"])
    .index("by_thread", ["threadId"])
    .index("by_deleteAt", ["deleteAt"]),
  /** Cached MinerU middle_json keyed by SHA-256 of PDF bytes. */
  mineruCache: defineTable({
    contentHash: v.string(),
    middleJsonStorageId: v.id("_storage"),
  }).index("by_contentHash", ["contentHash"]),
  /**
   * Single-flight lock so concurrent parse jobs for the same PDF
   * do not double-call MinerU. Cleared when cache is written; TTL on claimedAt.
   */
  mineruInFlight: defineTable({
    contentHash: v.string(),
    claimedAt: v.number(),
  }).index("by_contentHash", ["contentHash"]),
  /**
   * Parsed problems (global cache by PDF contentHash) or room-scoped shadow twins.
   * Parsed: contentHash set; roomId/parentProblemId absent.
   * Shadow: roomId + parentProblemId set; contentHash absent.
   */
  problems: defineTable({
    contentHash: v.optional(v.string()),
    roomId: v.optional(v.id("rooms")),
    parentProblemId: v.optional(v.id("problems")),
    problemNumber: v.string(),
    /** Question body as markdown with $ / $$. */
    problem: v.string(),
    /** Answer/facit as markdown with $ / $$ (empty when missing). */
    answer: v.string(),
  })
    .index("by_contentHash", ["contentHash"])
    .index("by_room_and_parent", ["roomId", "parentProblemId"])
    .index("by_parent", ["parentProblemId"]),
  /**
   * Distilled general instructions from a PDF, keyed by content hash.
   * Rooms opt in via cellsInUseByRoom.
   */
  pdfInfo: defineTable({
    contentHash: v.string(),
    text: v.string(),
  }).index("by_contentHash", ["contentHash"]),
  /** Which global pdfInfo cells a room has opted to use. */
  cellsInUseByRoom: defineTable({
    roomId: v.id("rooms"),
    contentHash: v.string(),
  })
    .index("by_room", ["roomId"])
    .index("by_room_and_contentHash", ["roomId", "contentHash"])
    .index("by_contentHash", ["contentHash"]),
  /**
   * Async PDF parse jobs (problems or info).
   * `statusUpdates` is a short progress log the workflow appends to.
   * `kind` missing on older rows → treat as "problems".
   */
  pdfParseJobs: defineTable({
    fileId: v.id("files"),
    roomId: v.id("rooms"),
    contentHash: v.string(),
    createdBy: v.id("users"),
    /** Missing on older jobs → treat as "problems". */
    kind: v.optional(
      v.union(v.literal("problems"), v.literal("info")),
    ),
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
    /** Only meaningful for kind "problems". */
    problemCount: v.optional(v.number()),
  })
    .index("by_file", ["fileId"])
    .index("by_contentHash", ["contentHash"])
    .index("by_contentHash_and_kind", ["contentHash", "kind"])
    .index("by_file_and_kind", ["fileId", "kind"])
    .index("by_room", ["roomId"]),
  /**
   * Global registry of concatenated PDFs, keyed by ordered input content hashes.
   * `inputKey` is `inputHashes.join("|")` (order-sensitive).
   */
  pdfMerges: defineTable({
    inputKey: v.string(),
    inputHashes: v.array(v.string()),
    mergedContentHash: v.string(),
    mergedStorageId: v.id("_storage"),
    createdBy: v.id("users"),
  })
    .index("by_inputKey", ["inputKey"])
    .index("by_mergedContentHash", ["mergedContentHash"]),
});
