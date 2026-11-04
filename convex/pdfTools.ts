import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const storageMeta = query({
  args: {
    storageId: v.id("_storage"),
  },
  returns: v.object({
    contentHash: v.string(),
    contentType: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (metadata === null) {
      throw new Error("Filen hittades inte i lagringen");
    }
    const contentType = metadata.contentType ?? null;
    const ct = (contentType ?? "").toLowerCase();
    if (ct !== "application/pdf" && ct !== "application/octet-stream") {
      throw new Error("Endast PDF-filer är tillåtna");
    }
    return {
      contentHash: metadata.sha256,
      contentType,
    };
  },
});
