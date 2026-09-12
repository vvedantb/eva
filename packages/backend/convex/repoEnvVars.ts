import { v } from "convex/values";
import {
  internalQuery,
  internalMutation,
  type DatabaseReader,
} from "./_generated/server";
import { type Id } from "./_generated/dataModel";
import { authQuery, authMutation, getRepoWithAccess } from "./functions";
import { MASKED_ENV_VAR_VALUE } from "./_envVars/listDisplay";
import {
  isSandboxIdentity,
  rejectSandboxCaller,
} from "./_auth/sandboxIdentity";

/** Loads the single env var document for a repo, or null if none exists. */
function findByRepo(db: DatabaseReader, repoId: Id<"githubRepos">) {
  return db
    .query("repoEnvVars")
    .withIndex("by_repo", (q) => q.eq("repoId", repoId))
    .first();
}

/** Lists repo env vars for the authenticated user, masking actual values. */
export const list = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(
    v.object({
      key: v.string(),
      value: v.string(),
      sandboxExclude: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    if (isSandboxIdentity(await ctx.auth.getUserIdentity())) return [];
    await getRepoWithAccess(ctx.db, args.repoId, ctx.userId);
    const doc = await findByRepo(ctx.db, args.repoId);
    if (!doc) return [];
    return doc.vars.map((entry) => ({
      key: entry.key,
      value: MASKED_ENV_VAR_VALUE,
      sandboxExclude: entry.sandboxExclude ?? false,
    }));
  },
});

/** Returns all repo env vars with raw encrypted values (internal use only). */
export const getAllInternal = internalQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(
    v.object({
      key: v.string(),
      value: v.string(),
      sandboxExclude: v.optional(v.boolean()),
    }),
  ),
  handler: async (ctx, args) => {
    const doc = await findByRepo(ctx.db, args.repoId);
    if (!doc) return [];
    return doc.vars;
  },
});

/** Returns repo env vars eligible for sandbox injection (excludes sandbox-excluded vars). */
export const getForSandbox = internalQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(v.object({ key: v.string(), value: v.string() })),
  handler: async (ctx, args) => {
    const doc = await findByRepo(ctx.db, args.repoId);
    if (!doc) return [];
    return doc.vars
      .filter((entry) => !entry.sandboxExclude)
      .map((entry) => ({ key: entry.key, value: entry.value }));
  },
});

/** Inserts or updates a single env var for a repo (internal use only). */
export const upsertVarInternal = internalMutation({
  args: {
    repoId: v.id("githubRepos"),
    key: v.string(),
    value: v.string(),
    sandboxExclude: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await findByRepo(ctx.db, args.repoId);
    const newEntry = {
      key: args.key,
      value: args.value,
      sandboxExclude: args.sandboxExclude ?? false,
    };
    if (doc) {
      const vars = doc.vars.filter((entry) => entry.key !== args.key);
      vars.push(newEntry);
      await ctx.db.patch(doc._id, { vars, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("repoEnvVars", {
        repoId: args.repoId,
        vars: [newEntry],
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

/** Removes an env var by key from a repo's env var document. */
export const removeVar = authMutation({
  args: {
    repoId: v.id("githubRepos"),
    key: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    await getRepoWithAccess(ctx.db, args.repoId, ctx.userId);
    const doc = await findByRepo(ctx.db, args.repoId);
    if (!doc) return null;
    const vars = doc.vars.filter((entry) => entry.key !== args.key);
    await ctx.db.patch(doc._id, { vars, updatedAt: Date.now() });
    return null;
  },
});

/** Toggles the sandboxExclude flag for a specific repo env var. */
export const toggleSandboxExclude = authMutation({
  args: {
    repoId: v.id("githubRepos"),
    key: v.string(),
    sandboxExclude: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    await getRepoWithAccess(ctx.db, args.repoId, ctx.userId);
    const doc = await findByRepo(ctx.db, args.repoId);
    if (!doc) return null;
    const vars = doc.vars.map((entry) =>
      entry.key === args.key
        ? { ...entry, sandboxExclude: args.sandboxExclude }
        : entry,
    );
    await ctx.db.patch(doc._id, { vars, updatedAt: Date.now() });
    return null;
  },
});
