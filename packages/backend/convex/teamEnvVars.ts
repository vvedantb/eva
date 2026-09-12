import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";
import { authQuery, authMutation } from "./functions";
import { MASKED_ENV_VAR_VALUE } from "./_envVars/listDisplay";
import { rejectSandboxCaller } from "./_auth/sandboxIdentity";

/** Lists team env vars for the authenticated user, masking actual values. */
export const list = authQuery({
  args: { teamId: v.id("teams") },
  returns: v.array(
    v.object({
      key: v.string(),
      value: v.string(),
      sandboxExclude: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_and_user", (q) =>
        q.eq("teamId", args.teamId).eq("userId", ctx.userId),
      )
      .first();

    if (!membership) return [];

    const doc = await ctx.db
      .query("teamEnvVars")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .first();

    if (!doc) return [];
    return doc.vars.map((entry) => ({
      key: entry.key,
      value: MASKED_ENV_VAR_VALUE,
      sandboxExclude: entry.sandboxExclude ?? false,
    }));
  },
});

/** Returns all team env vars with raw encrypted values (internal use only). */
export const getAllInternal = internalQuery({
  args: { teamId: v.id("teams") },
  returns: v.array(
    v.object({
      key: v.string(),
      value: v.string(),
      sandboxExclude: v.optional(v.boolean()),
    }),
  ),
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("teamEnvVars")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .first();
    if (!doc) return [];
    return doc.vars;
  },
});

/** Returns team env vars eligible for sandbox injection (excludes sandbox-excluded vars). */
export const getForSandbox = internalQuery({
  args: { teamId: v.id("teams") },
  returns: v.array(v.object({ key: v.string(), value: v.string() })),
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("teamEnvVars")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .first();
    if (!doc) return [];
    return doc.vars
      .filter((entry) => !entry.sandboxExclude)
      .map((entry) => ({ key: entry.key, value: entry.value }));
  },
});

/** Inserts or updates a single env var for a team (internal use only). */
export const upsertVarInternal = internalMutation({
  args: {
    teamId: v.id("teams"),
    key: v.string(),
    value: v.string(),
    sandboxExclude: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("teamEnvVars")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .first();
    if (doc) {
      const vars = doc.vars.filter((entry) => entry.key !== args.key);
      vars.push({
        key: args.key,
        value: args.value,
        sandboxExclude: args.sandboxExclude ?? false,
      });
      await ctx.db.patch(doc._id, { vars, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("teamEnvVars", {
        teamId: args.teamId,
        vars: [
          {
            key: args.key,
            value: args.value,
            sandboxExclude: args.sandboxExclude ?? false,
          },
        ],
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

/** Removes an env var by key from a team's env var document. Requires team membership. */
export const removeVar = authMutation({
  args: {
    teamId: v.id("teams"),
    key: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_and_user", (q) =>
        q.eq("teamId", args.teamId).eq("userId", ctx.userId),
      )
      .first();

    if (!membership) throw new Error("Not a team member");

    const doc = await ctx.db
      .query("teamEnvVars")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .first();

    if (!doc) return null;

    const vars = doc.vars.filter((entry) => entry.key !== args.key);
    await ctx.db.patch(doc._id, { vars, updatedAt: Date.now() });
    return null;
  },
});

/** Toggles the sandboxExclude flag for a specific team env var. Requires team membership. */
export const toggleSandboxExclude = authMutation({
  args: {
    teamId: v.id("teams"),
    key: v.string(),
    sandboxExclude: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_and_user", (q) =>
        q.eq("teamId", args.teamId).eq("userId", ctx.userId),
      )
      .first();

    if (!membership) throw new Error("Not a team member");

    const doc = await ctx.db
      .query("teamEnvVars")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .first();
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
