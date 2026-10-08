import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
  }).index("by_email", ["email"]),
  signInProivders: defineTable({
    userId: v.id("users"),
    provider: v.union(v.literal("temp"), v.literal("openai")),
    providerId: v.string(),
  }).index("by_provider", ["provider", "providerId"]),
  rooms: defineTable({
    name: v.string(),
    description: v.string(),
  }).index("by_name", ["name"]),
  files: defineTable({
    roomId: v.id("rooms"),
    name: v.string(),
    storageId:v.id("_storage")
  }).index("by_room", ["roomId"]),
  roomMembers: defineTable({
    roomId: v.id("rooms"),
    userId: v.id("users"),
  }).index("by_room", ["roomId"]).index("by_user", ["userId"])
});
