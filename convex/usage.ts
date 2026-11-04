import { getAuthUserId } from "@convex-dev/auth/server";
import type { UsageHandler } from "@convex-dev/agent";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, query } from "./_generated/server";
import {
  chargeSourceValidator,
  chatModeValidator,
  type ChargeSource,
  type ChatMode,
} from "./lib/lumoContent";

const usageBucketValidator = v.object({
  totalTokens: v.number(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  costUsd: v.number(),
  eventCount: v.number(),
});

const chatUsageBucketValidator = v.object({
  totalTokens: v.number(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  costUsd: v.number(),
  eventCount: v.number(),
  byMode: v.object({
    normal: usageBucketValidator,
    genomgang: usageBucketValidator,
  }),
});

function emptyBucket() {
  return {
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    eventCount: 0,
  };
}

function emptyChatBucket() {
  return {
    ...emptyBucket(),
    byMode: {
      normal: emptyBucket(),
      genomgang: emptyBucket(),
    },
  };
}

function addToBucket(
  bucket: {
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    eventCount: number;
  },
  event: {
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    costUsd?: number;
  },
) {
  bucket.totalTokens += event.totalTokens;
  bucket.inputTokens += event.inputTokens;
  bucket.outputTokens += event.outputTokens;
  bucket.costUsd += event.costUsd ?? 0;
  bucket.eventCount += 1;
}

/** Pull USD cost from OpenRouter usage accounting in providerMetadata. */
export function costUsdFromProviderMetadata(
  providerMetadata: Record<string, unknown> | undefined | null,
): number | undefined {
  if (providerMetadata === undefined || providerMetadata === null) {
    return undefined;
  }
  const openrouterMeta = providerMetadata.openrouter;
  if (
    typeof openrouterMeta !== "object" ||
    openrouterMeta === null ||
    Array.isArray(openrouterMeta)
  ) {
    return undefined;
  }
  const usage = (openrouterMeta as { usage?: { cost?: unknown } }).usage;
  if (usage === undefined || typeof usage.cost !== "number") {
    return undefined;
  }
  return usage.cost;
}

export function tokensFromSdkUsage(usage: {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  totalTokens?: number | undefined;
}): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} {
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens: usage.totalTokens ?? inputTokens + outputTokens,
  };
}

export const insertUsage = internalMutation({
  args: {
    userId: v.id("users"),
    chargeSource: chargeSourceValidator,
    chatMode: v.optional(chatModeValidator),
    agentName: v.optional(v.string()),
    model: v.string(),
    provider: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    totalTokens: v.number(),
    costUsd: v.optional(v.number()),
    threadId: v.optional(v.string()),
  },
  returns: v.id("llmUsage"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("llmUsage", {
      userId: args.userId,
      chargeSource: args.chargeSource,
      chatMode: args.chatMode,
      agentName: args.agentName,
      model: args.model,
      provider: args.provider,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      totalTokens: args.totalTokens,
      costUsd: args.costUsd,
      threadId: args.threadId,
    });
  },
});

type UsageHandlerExtras = {
  chatMode?: ChatMode;
};

/**
 * Fixed chargeSource handler for billable agents.
 * Chat should pass chatMode via extras so rows break down by mode.
 * Twin generation records one aggregated row in createShadow instead.
 */
export function makeUsageHandler(
  chargeSource: ChargeSource,
  extras?: UsageHandlerExtras,
): UsageHandler {
  return async (ctx, args) => {
    if (args.userId === undefined || args.userId === null || args.userId === "") {
      return;
    }

    const tokens = tokensFromSdkUsage(args.usage);
    const costUsd = costUsdFromProviderMetadata(
      args.providerMetadata as Record<string, unknown> | undefined,
    );

    await ctx.runMutation(internal.usage.insertUsage, {
      userId: args.userId as Id<"users">,
      chargeSource,
      chatMode: chargeSource === "chat" ? extras?.chatMode : undefined,
      agentName: args.agentName,
      model: args.model,
      provider: args.provider,
      ...tokens,
      costUsd,
      threadId: args.threadId,
    });
  };
}

/** Per-call chat handler closed over mode (Agent supports handler per message). */
export function chatUsageHandler(chatMode: ChatMode): UsageHandler {
  return makeUsageHandler("chat", { chatMode });
}

export const myUsage = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      totalTokens: v.number(),
      inputTokens: v.number(),
      outputTokens: v.number(),
      costUsd: v.number(),
      eventCount: v.number(),
      bySource: v.object({
        chat: chatUsageBucketValidator,
        twin_generation: usageBucketValidator,
      }),
    }),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }

    const events = await ctx.db
      .query("llmUsage")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(10_000);

    const bySource = {
      chat: emptyChatBucket(),
      twin_generation: emptyBucket(),
    };

    let totalTokens = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let costUsd = 0;

    for (const event of events) {
      totalTokens += event.totalTokens;
      inputTokens += event.inputTokens;
      outputTokens += event.outputTokens;
      costUsd += event.costUsd ?? 0;

      if (event.chargeSource === "chat") {
        addToBucket(bySource.chat, event);
        const mode = event.chatMode ?? "normal";
        addToBucket(bySource.chat.byMode[mode], event);
      } else {
        addToBucket(bySource.twin_generation, event);
      }
    }

    return {
      totalTokens,
      inputTokens,
      outputTokens,
      costUsd,
      eventCount: events.length,
      bySource,
    };
  },
});
