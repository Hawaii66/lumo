import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Delete a storage blob only when no room file, template file, or pdfMerges
 * row still references it. Safe for shared blobs across clones/templates.
 */
export async function deleteStorageIfUnreferenced(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  contentHash: string,
): Promise<void> {
  const otherFiles = await ctx.db
    .query("files")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .take(2);
  if (otherFiles.length > 0) {
    return;
  }

  const templateFiles = await ctx.db
    .query("roomTemplateFiles")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .take(1);
  if (templateFiles.length > 0) {
    return;
  }

  const mergeKeepers = await ctx.db
    .query("pdfMerges")
    .withIndex("by_mergedContentHash", (q) =>
      q.eq("mergedContentHash", contentHash),
    )
    .take(5);
  if (mergeKeepers.some((m) => m.mergedStorageId === storageId)) {
    return;
  }

  await ctx.storage.delete(storageId);
}
