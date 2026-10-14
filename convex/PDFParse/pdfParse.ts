import { v } from "convex/values";
import { action, ActionCtx, mutation, MutationCtx, QueryCtx } from "../_generated/server";
import { parseProblemPageInfo } from "./problemPageAgent";
import { api, internal } from "../_generated/api";
import { MergePages, ProblemPageInfo } from "./types";
import { Id } from "../_generated/dataModel";
import { PDFDocument } from "pdf-lib"

export const parsePdf = action({
    args: {
        fileId: v.id("_storage"),
        userId: v.id("users"),
    },
    handler: async (ctx, args) => {
        const problems = await ctx.runAction(internal.PDFParse.problemPageAgent.parseProblemPageInfo, {
            fileId: args.fileId,
            userId: args.userId
        })

        if (problems === null) {
            return null;
        }

        const mergePages = ProblemPagesToMergePages(problems);
        const splitPdfs = await SplitPdfByProblemPages(mergePages, args.fileId, ctx);

        return splitPdfs
    }
})

async function SplitPdfByProblemPages(pages: MergePages[], fileId: Id<"_storage">, ctx: ActionCtx) {
    const pdfBlob = await ctx.storage.get(fileId);
    if (pdfBlob === null) {
        return null
    }

    const pdfArrayBuffer = await pdfBlob.arrayBuffer();
    const pdf = await PDFDocument.load(pdfArrayBuffer, { ignoreEncryption: true });

    const work = pages.map(async (pageRange) => {
        const rangedPdf = await PDFDocument.create();

        const zeroIndexedRange = pageRange.pages.map((page) => page - 1);
        const copiedPages = await rangedPdf.copyPages(pdf, zeroIndexedRange);

        copiedPages.forEach((page) => rangedPdf.addPage(page));

        const copiedPageBytes = await rangedPdf.save();
        const blob = new Blob([copiedPageBytes as any], { type: "application/pdf" });
        const fileId = await ctx.storage.store(blob);
        return {
            ...pageRange,
            fileId
        }
    });

    return Promise.all(work);
}

function ProblemPagesToMergePages(problemPages: ProblemPageInfo[]): MergePages[] {
    const groupsMap = new Map<string, MergePages>();

    problemPages.forEach((problem) => {
        const combined = [...problem.questionPages, ...problem.answerPages];
        const uniquePages = Array.from(new Set(combined)).sort((a, b) => a - b);

        const key = uniquePages.join(",");
        if (!groupsMap.has(key)) {
            groupsMap.set(key, { pages: uniquePages, problems: [problem] });
        } else {
            groupsMap.get(key)?.problems.push(problem);
        }
    });

    return Array.from(groupsMap.values());
}