import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  chargeSourceValidator,
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
    /** Missing → treat as default role. */
    roleId: v.optional(v.id("roles")),
    /**
     * Dashboard-only appearance. Missing → treat as "light".
     * Applied under /dashboard; marketing and other routes stay on :root.
     */
    theme: v.optional(
      v.union(
        v.literal("light"),
        v.literal("dark"),
        v.literal("purple"),
        v.literal("ocean"),
        v.literal("rose"),
      ),
    ),
    /**
     * Room sidebar problem list layout. Missing → treat as "list".
     * "list" = PDF → problems; "tree" = PDF → major chapters → problems.
     */
    problemListMode: v.optional(
      v.union(v.literal("list"), v.literal("tree")),
    ),
  })
    .index("email", ["email"])
    .index("by_role", ["roleId"]),
  /**
   * Role catalog (default / promoter / admin). Daily free credits come from
   * `freeDailyCredits` on the user's role (fallback: default row).
   */
  roles: defineTable({
    key: v.union(
      v.literal("default"),
      v.literal("promoter"),
      v.literal("admin"),
    ),
    freeDailyCredits: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
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
  }),
  files: defineTable({
    roomId: v.id("rooms"),
    name: v.string(),
    storageId: v.id("_storage"),
    /** SHA-256 from Convex storage metadata, set on upload. */
    contentHash: v.string(),
    /**
     * Display order of this PDF under Uppgifter (lower = higher).
     * Missing on unordered/new files → sorted after ordered ones by name.
     */
    problemSortOrder: v.optional(v.number()),
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
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["status"],
    }),
  roomTemplateFiles: defineTable({
    templateId: v.id("roomTemplates"),
    name: v.string(),
    storageId: v.id("_storage"),
    contentHash: v.string(),
    /** Copied from source room file; missing on older templates. */
    problemSortOrder: v.optional(v.number()),
  })
    .index("by_template", ["templateId"])
    .index("by_storageId", ["storageId"]),
  roomTemplateInfoCells: defineTable({
    templateId: v.id("roomTemplates"),
    contentHash: v.string(),
  }).index("by_template", ["templateId"]),
  /**
   * Snapshot of room problem star ratings for a published template.
   * Copied into roomProblemStars on clone.
   */
  roomTemplateProblemStars: defineTable({
    templateId: v.id("roomTemplates"),
    contentHash: v.string(),
    problemNumber: v.string(),
    /**
     * Deluppgift letter (`a`–`z`), or `""` for the whole problem when it has
     * no deluppgifter. Missing on older template rows → treat as `""`.
     */
    subproblemLetter: v.optional(v.string()),
    stars: v.union(v.literal(1), v.literal(2), v.literal(3)),
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
     * `deleteAt` is the absolute archive deadline when not infinite;
     * `archiveJobId` is the one-shot scheduler job that archives at that time.
     */
    deletionExpiry: v.optional(chatDeletionExpiryValidator),
    deleteAt: v.optional(v.number()),
    archiveJobId: v.optional(v.id("_scheduled_functions")),
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
   * Room-scoped star rating (1–3) for a parsed problem / deluppgift.
   * Keyed by contentHash + problemNumber + subproblemLetter so ratings
   * survive reparse and clone. `subproblemLetter` is `""` for whole problems
   * without deluppgifter, otherwise `a`–`z`. Missing letter on older rows → `""`.
   * Shadows are not starred.
   */
  roomProblemStars: defineTable({
    roomId: v.id("rooms"),
    contentHash: v.string(),
    problemNumber: v.string(),
    subproblemLetter: v.optional(v.string()),
    stars: v.union(v.literal(1), v.literal(2), v.literal(3)),
  })
    .index("by_room", ["roomId"])
    .index("by_room_and_contentHash_and_problemNumber_and_subproblemLetter", [
      "roomId",
      "contentHash",
      "problemNumber",
      "subproblemLetter",
    ]),
  /**
   * Room-scoped completion mark for a parsed problem / deluppgift.
   * Same identity keying as roomProblemStars. Row present ⇒ completed.
   * Personal progress — never published into templates or copied on clone.
   * Shadows are not marked complete.
   */
  roomProblemCompletions: defineTable({
    roomId: v.id("rooms"),
    contentHash: v.string(),
    problemNumber: v.string(),
    subproblemLetter: v.optional(v.string()),
  })
    .index("by_room", ["roomId"])
    .index("by_room_and_contentHash_and_problemNumber_and_subproblemLetter", [
      "roomId",
      "contentHash",
      "problemNumber",
      "subproblemLetter",
    ]),
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
    .index("by_room_and_contentHash", ["roomId", "contentHash"]),
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
    createdBy: v.optional(v.id("users")),
  })
    .index("by_inputKey", ["inputKey"])
    .index("by_mergedContentHash", ["mergedContentHash"]),
  /**
   * Global registry of page-range extracts, keyed by source hash + ranges.
   * `inputKey` is `${sourceContentHash}|${pageRangesKey}` (order-sensitive).
   */
  pdfExtracts: defineTable({
    inputKey: v.string(),
    sourceContentHash: v.string(),
    pageRanges: v.array(
      v.object({
        start: v.number(),
        end: v.number(),
      }),
    ),
    extractedContentHash: v.string(),
    extractedStorageId: v.id("_storage"),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_inputKey", ["inputKey"])
    .index("by_extractedContentHash", ["extractedContentHash"])
    .index("by_sourceContentHash", ["sourceContentHash"]),
  /**
   * Per-call LLM token usage for billable features (chat + twin generation).
   * PDF parse agents are intentionally not recorded here.
   */
  llmUsage: defineTable({
    userId: v.id("users"),
    chargeSource: chargeSourceValidator,
    /** Set only for chargeSource === "chat". */
    chatMode: v.optional(chatModeValidator),
    agentName: v.optional(v.string()),
    model: v.string(),
    provider: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    totalTokens: v.number(),
    /** OpenRouter-reported USD cost; missing on older rows or if accounting omitted. */
    costUsd: v.optional(v.number()),
    threadId: v.optional(v.string()),
  }).index("by_user", ["userId"]),
  /**
   * Singleton pricing config (`key: "default"`). Mutable via `credits.updateConfig`.
   * Daily free grants live on `roles.freeDailyCredits`, not here.
   * `freeDailyCredits` is optional legacy leftover from before roles owned grants.
   */
  creditConfig: defineTable({
    key: v.literal("default"),
    freeDailyCredits: v.optional(v.number()),
    chatCreditCost: v.number(),
    twinCreditCost: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
  /** Per-user credit wallets: daily free (resets) + paid top-ups (never expire). */
  creditBalances: defineTable({
    userId: v.id("users"),
    dailyRemaining: v.number(),
    /** YYYY-MM-DD in Europe/Stockholm when dailyRemaining was last granted. */
    dailyGrantDate: v.string(),
    paidBalance: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
  /** Append-only credit movements for audit / debug. */
  creditLedger: defineTable({
    userId: v.id("users"),
    delta: v.number(),
    balanceAfterDaily: v.number(),
    balanceAfterPaid: v.number(),
    kind: v.union(
      v.literal("daily_grant"),
      v.literal("purchase"),
      v.literal("spend_chat"),
      v.literal("spend_twin"),
      v.literal("refund"),
      v.literal("admin_adjust"),
    ),
    refId: v.optional(v.string()),
    /** Set on Stripe purchase rows when deal metadata was present. */
    dealId: v.optional(v.id("creditDeals")),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_createdAt", ["userId", "createdAt"])
    .index("by_refId", ["refId"]),
  /**
   * Buyable credit packs (Stripe Checkout reads price/credits from here).
   * Seed via creditDeals.seedDefaultDeals; edit via upsertDeal.
   */
  creditDeals: defineTable({
    name: v.string(),
    description: v.string(),
    /** Whole kronor charged at Checkout (öre = priceSek * 100). */
    priceSek: v.number(),
    creditsGranted: v.number(),
    active: v.boolean(),
    sortOrder: v.number(),
    updatedAt: v.number(),
  }).index("by_active_and_sortOrder", ["active", "sortOrder"]),
});
