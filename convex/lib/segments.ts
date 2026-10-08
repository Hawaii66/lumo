import { v } from "convex/values";

export const segmentValidator = v.object({
  type: v.union(
    v.literal("text"),
    v.literal("latex"),
    v.literal("subproblem"),
  ),
  content: v.string(),
});

export const pageRangeValidator = v.object({
  start: v.number(),
  end: v.number(),
});
