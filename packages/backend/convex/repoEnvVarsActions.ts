"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { encryptValue, decryptValue } from "./encryption";
import { getActionRepoWithAccess } from "./functions";
import { isSandboxIdentity } from "./_auth/sandboxIdentity";

/** Decrypts and reveals the plaintext value of a specific repo env var. */
export const revealValue = action({
  args: {
    repoId: v.id("githubRepos"),
    key: v.string(),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    await getActionRepoWithAccess(ctx, args.repoId);
    const vars: Array<{
      key: string;
      value: string;
      sandboxExclude?: boolean;
    }> = await ctx.runQuery(internal.repoEnvVars.getAllInternal, {
      repoId: args.repoId,
    });
    const entry = vars.find((entry) => entry.key === args.key);
    if (!entry) return null;
    if (isSandboxIdentity(identity) && entry.sandboxExclude === true) {
      throw new Error("Not authorized");
    }
    return decryptValue(entry.value);
  },
});

/** Encrypts and upserts a repo env var value. */
export const upsertVar = action({
  args: {
    repoId: v.id("githubRepos"),
    key: v.string(),
    value: v.string(),
    sandboxExclude: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    await getActionRepoWithAccess(ctx, args.repoId);
    if (isSandboxIdentity(identity)) {
      throw new Error("Not authorized");
    }
    const stored = encryptValue(args.value);
    await ctx.runMutation(internal.repoEnvVars.upsertVarInternal, {
      repoId: args.repoId,
      key: args.key,
      value: stored,
      sandboxExclude: args.sandboxExclude,
    });
    return null;
  },
});
