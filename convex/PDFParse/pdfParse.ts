import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import {
  lumoParsedProblemValidator,
  type LumoParsedProblem,
} from "../lib/lumoContent";
import {
  flattenMiddleJson,
  splitIntoProblemChunks,
  type ProblemChunk,
} from "./middleJson";
import { fetchMineruMiddleJson } from "./mineruClient";

/** Max concurrent per-problem agent calls. */
const AGENT_CONCURRENCY = 5;

const lumoProblemListValidator = v.array(lumoParsedProblemValidator);

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index]!, index);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

/**
 * Parse a math PDF from Convex storage into Lumo-language problems.
 *
 * 1. POST the PDF to MinerU (middle_json)
 * 2. Split Problem / Svar sections into per-P-number chunks
 * 3. Run the raw problem agent on each chunk
 * 4. Convert each raw problem to Lumo (text + latex + subproblem only)
 */
export const parseProblems = action({
  args: {
    fileId: v.id("_storage"),
    userId: v.id("users"),
  },
  returns: lumoProblemListValidator,
  handler: async (ctx, args) => {
    const blob = await ctx.storage.get(args.fileId);
    if (blob === null) {
      throw new Error("PDF-filen hittades inte i lagringen");
    }

    const middleJson = await fetchMineruMiddleJson(blob);
    const { problemLines, answerLines } = flattenMiddleJson(middleJson);
    const chunks: ProblemChunk[] = splitIntoProblemChunks(
      problemLines,
      answerLines,
    );

    if (chunks.length === 0) {
      return [];
    }

    const rawProblems = await mapPool(
      chunks,
      AGENT_CONCURRENCY,
      async (chunk) => {
        const parsed: {
          rawProblemNumber: string;
          rawText: string;
          rawAnswer: string;
        } = await ctx.runAction(
          internal.PDFParse.problemPageAgent.parseProblemChunk,
          {
            userId: args.userId,
            problemNumber: chunk.problemNumber,
            problemText: chunk.problemText,
            answerText: chunk.answerText,
          },
        );
        return parsed;
      },
    );

    const problems: LumoParsedProblem[] = await mapPool(
      rawProblems,
      AGENT_CONCURRENCY,
      async (raw): Promise<LumoParsedProblem> => {
        const converted: LumoParsedProblem = await ctx.runAction(
          internal.PDFParse.lumoProblemAgent.convertRawProblem,
          {
            userId: args.userId,
            raw,
          },
        );
        return converted;
      },
    );

    return problems;
  },
});
