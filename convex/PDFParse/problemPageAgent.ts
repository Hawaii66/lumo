import { Agent } from "@convex-dev/agent";
import { v } from "convex/values";
import { components } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { openrouter } from "../agents/openrouter";
import { z } from "zod/v4";
import { ProblemPageInfoSchema } from "./types";

export const roomAgent = new Agent(components.agent, {
    name: "Lumo",
    languageModel: openrouter("openai/gpt-4o-mini"),
    instructions: "Your goal is to parse out each problem number and what page numbers that problem is on, both question and answer. If a problem spans multiple pages include eage page number.",
});

export const parseProblemPageInfo = internalAction({
    args: {
        fileId: v.id("_storage"),
        userId: v.id("users"),
    },
    handler: async (ctx, args) => {
        const url = await ctx.storage.getUrl(args.fileId);
        if (!url) {
            return null
        }

        const parsedProblems = await roomAgent.generateObject(ctx, {
            userId: args.userId
        }, {
            schema: z.object({
                problems: z.array(ProblemPageInfoSchema)
            }),
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: "Parse out each problem number and what page numbers that problem is on, both question and answer. If a problem spans multiple pages include eage page number"
                        }, {
                            type: "file",
                            data: url,
                            mediaType: "application/pdf",
                        }
                    ]
                }
            ]
        })

        const problems = parsedProblems.object.problems
        return problems
    },
});