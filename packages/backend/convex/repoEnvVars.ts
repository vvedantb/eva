import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";
import { authQuery, authMutation, getRepoWithAccess } from "./functions";
import {
  findRepoEnvVarDoc,
  maskEnvVarEntries,
  removeEnvVarEntry,
  toggleEnvVarSandboxExclude,
  upsertEnvVarEntry,
} from "./_envVars/documentStore";
import {
  envVarEntryValidator,
  maskedEnvVarEntryValidator,
} from "./validators";

/** Lists repo env vars for the authenticated user, masking actual values. */
export const list = authQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(maskedEnvVarEntryValidator),
  handler: async (ctx, args) => {
    await getRepoWithAccess(ctx.db, args.repoId, ctx.userId);
    const doc = await findRepoEnvVarDoc(ctx.db, args.repoId);
    if (!doc) return [];
    return maskEnvVarEntries(doc.vars);
  },
});

/** Returns all repo env vars with raw encrypted values (internal use only). */
export const getAllInternal = internalQuery({
  args: { repoId: v.id("githubRepos") },
  returns: v.array(envVarEntryValidator),
  handler: async (ctx, args) => {
    const doc = await findRepoEnvVarDoc(ctx.db, args.repoId);
    if (!doc) return [];
    return doc.vars;
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
    const doc = await findRepoEnvVarDoc(ctx.db, args.repoId);
    const newEntry = {
      key: args.key,
      value: args.value,
      sandboxExclude: args.sandboxExclude ?? false,
    };
    if (doc) {
      await ctx.db.patch(doc._id, {
        vars: upsertEnvVarEntry(doc.vars, newEntry),
        updatedAt: Date.now(),
      });
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
    await getRepoWithAccess(ctx.db, args.repoId, ctx.userId);
    const doc = await findRepoEnvVarDoc(ctx.db, args.repoId);
    if (!doc) return null;
    const vars = removeEnvVarEntry(doc.vars, args.key);
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
    await getRepoWithAccess(ctx.db, args.repoId, ctx.userId);
    const doc = await findRepoEnvVarDoc(ctx.db, args.repoId);
    if (!doc) return null;
    const vars = toggleEnvVarSandboxExclude(
      doc.vars,
      args.key,
      args.sandboxExclude,
    );
    await ctx.db.patch(doc._id, { vars, updatedAt: Date.now() });
    return null;
  },
});
