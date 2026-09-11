import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";
import { authQuery, authMutation } from "./functions";
import {
  maskEnvVarEntries,
  removeEnvVarEntry,
  sandboxEligibleEnvVars,
  toggleEnvVarSandboxExclude,
  upsertEnvVarEntry,
} from "./_envVars/documentStore";

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
    return maskEnvVarEntries(doc.vars);
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
    return sandboxEligibleEnvVars(doc.vars);
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
      await ctx.db.insert("teamEnvVars", {
        teamId: args.teamId,
        vars: [newEntry],
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

    const vars = removeEnvVarEntry(doc.vars, args.key);
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
    const vars = toggleEnvVarSandboxExclude(
      doc.vars,
      args.key,
      args.sandboxExclude,
    );
    await ctx.db.patch(doc._id, { vars, updatedAt: Date.now() });
    return null;
  },
});
