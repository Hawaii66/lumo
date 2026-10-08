import type { MutationCtx, QueryCtx } from "../_generated/server";

/** A page is complete only if it has ≥1 problem and every one is ready. */
export async function pageHasAllProblemsReady(
  ctx: QueryCtx | MutationCtx,
  pdfHash: string,
  pageNumber: number,
): Promise<boolean> {
  const problemsOnPage = await ctx.db
    .query("problems")
    .withIndex("by_pdfHash_and_sourcePage", (q) =>
      q.eq("pdfHash", pdfHash).eq("sourcePage", pageNumber),
    )
    .take(100);

  if (problemsOnPage.length === 0) {
    return false;
  }
  return problemsOnPage.every((problem) => problem.status === "ready");
}
