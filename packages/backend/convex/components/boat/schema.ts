import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const nullableString = v.optional(v.union(v.string(), v.null()));

/** What the component caches about a Boat sandbox. Refreshed on every call and by the settle poll. */
export const sandboxInfo = v.object({
  id: v.string(),
  name: v.string(),
  state: v.string(),
  type: v.optional(v.string()),
  url: nullableString,
  ip: nullableString,
  subdomain: nullableString,
  archiveAfter: nullableString,
  createdAt: nullableString,
  updatedAt: nullableString,
  snapshotAvailable: v.optional(v.boolean()),
  snapshotCompletedAt: nullableString,
  setupStatus: nullableString,
  setupError: nullableString,
});

export default defineSchema({
  sandboxes: defineTable({
    ownerId: v.string(),
    key: v.string(),
    /** Sent as Boat's Idempotency-Key, so a retried create never bills a second sandbox. */
    token: v.string(),
    sandboxId: v.optional(v.string()),
    /** "creating" until Boat returns an id, then Boat's own state. */
    state: v.string(),
    sandbox: v.optional(sandboxInfo),
    lastError: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_owner_key", ["ownerId", "key"])
    .index("by_sandbox", ["sandboxId"]),
});
