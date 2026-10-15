import { Agent } from "@convex-dev/agent";
import { v } from "convex/values";
import { components } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { openrouter } from "../agents/openrouter";
import { z } from "zod/v4";
import { ProblemPageInfoSchema } from "./types";

export const roomAgent = new Agent(components.agent, {
    name: "Lumo",
    languageModel: openrouter("openai/gpt-5.6-sol"),
});

export const parseProblemText = internalAction({
    args: {
        problemNumber: v.string(),
        url:v.string(),
        userId: v.id("users"),
    },
    handler: async (ctx, args) => {
        const parsedProblems = await roomAgent.generateObject(ctx, {
            userId: args.userId
        }, {
            schema: z.object({
                problemNumber: z.string().describe("The problem number"),
                question:z.string().describe("The question text"),
                answer:z.string().describe("The answer text"),
            }),
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: `Parse out the question and answer text for problem number ${args.problemNumber} from the PDF. Return the question and answer text as separate fields. If the question or answer contains math use latext format wrapped in $$`
                        }, {
                            type: "file",
                            data: args.url,
                            mediaType: "application/pdf",
                        }
                    ]
                }
            ]
        })

        const question = parsedProblems.object
        return question
    },
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
                problems: z.array(ProblemPageInfoSchema),
                pageCount: z.number().describe("The total number of pages in the PDF")
            }),
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: "Parse out each problem number and what page numbers that problem is on, both question and answer. If a problem spans multiple pages include eage page number. Also return the number of pages on a 1 index base"
                        }, {
                            type: "file",
                            data: url,
                            mediaType: "application/pdf",
                        }
                    ]
                }
            ]
        })

        const problems = parsedProblems.object
        return problems
    },
});