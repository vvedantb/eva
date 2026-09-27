import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import schema, { sandboxInfo } from "./schema";

export const sandboxRecord = schema.tables.sandboxes.validator.extend({
  _id: v.id("sandboxes"),
  _creationTime: v.number(),
});
type SandboxRecord = typeof sandboxRecord.type;

/** The public shape: the idempotency token stays inside the component. */
export const publicRecord = v.object({
  ownerId: v.string(),
  key: v.string(),
  sandboxId: v.optional(v.string()),
  state: v.string(),
  sandbox: v.optional(sandboxInfo),
  lastError: v.optional(v.string()),
  updatedAt: v.number(),
});

export function toPublic(record: SandboxRecord): typeof publicRecord.type {
  const { _id, _creationTime, token, ...rest } = record;
  return rest;
}

async function reread(ctx: MutationCtx, id: Id<"sandboxes">) {
  const record = await ctx.db.get(id);
  if (record === null) throw new Error(`Boat sandbox record ${id} vanished`);
  return record;
}

export const get = query({
  args: { ownerId: v.string(), key: v.string() },
  returns: v.union(publicRecord, v.null()),
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("sandboxes")
      .withIndex("by_owner_key", (q) =>
        q.eq("ownerId", args.ownerId).eq("key", args.key),
      )
      .unique();
    return record ? toPublic(record) : null;
  },
});

export const list = query({
  args: { ownerId: v.string(), limit: v.optional(v.number()) },
  returns: v.array(publicRecord),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 100), 500));
    const records = await ctx.db
      .query("sandboxes")
      .withIndex("by_owner_key", (q) => q.eq("ownerId", args.ownerId))
      .take(limit);
    return records.map(toPublic);
  },
});

export const find = internalQuery({
  args: { ownerId: v.string(), key: v.string() },
  returns: v.union(sandboxRecord, v.null()),
  handler: async (ctx, args) =>
    await ctx.db
      .query("sandboxes")
      .withIndex("by_owner_key", (q) =>
        q.eq("ownerId", args.ownerId).eq("key", args.key),
      )
      .unique(),
});

export const byId = internalQuery({
  args: { id: v.id("sandboxes") },
  returns: v.union(sandboxRecord, v.null()),
  handler: async (ctx, args) => await ctx.db.get(args.id),
});

export const reserve = internalMutation({
  args: { ownerId: v.string(), key: v.string(), token: v.string() },
  returns: sandboxRecord,
  handler: async (ctx, args) => {
    if (!args.ownerId.trim() || !args.key.trim()) {
      throw new Error("ownerId and key must not be empty");
    }
    const existing = await ctx.db
      .query("sandboxes")
      .withIndex("by_owner_key", (q) =>
        q.eq("ownerId", args.ownerId).eq("key", args.key),
      )
      .unique();
    if (existing) return existing;
    const id = await ctx.db.insert("sandboxes", {
      ...args,
      state: "creating",
      updatedAt: Date.now(),
    });
    return await reread(ctx, id);
  },
});

/** Store Boat's latest view of the sandbox. Linking a new sandbox id is only allowed from "creating". */
export const sync = internalMutation({
  args: { id: v.id("sandboxes"), sandbox: sandboxInfo },
  returns: v.union(sandboxRecord, v.null()),
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) return null;
    if (record.sandboxId && record.sandboxId !== args.sandbox.id) {
      throw new Error(
        `Record ${record.key} is linked to ${record.sandboxId}, not ${args.sandbox.id}`,
      );
    }
    await ctx.db.patch(args.id, {
      sandboxId: args.sandbox.id,
      state: args.sandbox.state,
      sandbox: args.sandbox,
      lastError: undefined,
      updatedAt: Date.now(),
    });
    return await reread(ctx, args.id);
  },
});

export const fail = internalMutation({
  args: { id: v.id("sandboxes"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await ctx.db.get(args.id)) {
      await ctx.db.patch(args.id, {
        lastError: args.error,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const remove = internalMutation({
  args: { id: v.id("sandboxes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await ctx.db.get(args.id)) await ctx.db.delete(args.id);
    return null;
  },
});
