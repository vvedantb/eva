"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { encryptValue } from "./encryption";
import { decryptStoredEntry } from "./_envVars/encryptedEntries";
import { assertActionTeamAccess } from "./functions";

/** Decrypts and reveals the plaintext value of a specific team env var. */
export const revealValue = action({
  args: {
    teamId: v.id("teams"),
    key: v.string(),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    await assertActionTeamAccess(ctx, args.teamId);
    const vars: Array<{ key: string; value: string }> = await ctx.runQuery(
      internal.teamEnvVars.getAllInternal,
      { teamId: args.teamId },
    );
    return decryptStoredEntry(vars, args.key);
  },
});

/** Encrypts and upserts a team env var value. */
export const upsertVar = action({
  args: {
    teamId: v.id("teams"),
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
    await assertActionTeamAccess(ctx, args.teamId);
    const stored = encryptValue(args.value);
    await ctx.runMutation(internal.teamEnvVars.upsertVarInternal, {
      teamId: args.teamId,
      key: args.key,
      value: stored,
      sandboxExclude: args.sandboxExclude,
    });
    return null;
  },
});
