import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";
import { authQuery, authMutation, hasTeamAccess } from "./functions";
import {
  findTeamEnvVarDoc,
  maskEnvVarEntries,
  removeEnvVarEntry,
  toggleEnvVarSandboxExclude,
  upsertEnvVarEntry,
} from "./_envVars/documentStore";
import {
  envVarEntryValidator,
  maskedEnvVarEntryValidator,
} from "./validators";

/** Lists team env vars for the authenticated user, masking actual values. */
export const list = authQuery({
  args: { teamId: v.id("teams") },
  returns: v.array(maskedEnvVarEntryValidator),
  handler: async (ctx, args) => {
    if (!(await hasTeamAccess(ctx.db, args.teamId, ctx.userId))) return [];

    const doc = await findTeamEnvVarDoc(ctx.db, args.teamId);

    if (!doc) return [];
    return maskEnvVarEntries(doc.vars);
  },
});

/** Returns all team env vars with raw encrypted values (internal use only). */
export const getAllInternal = internalQuery({
  args: { teamId: v.id("teams") },
  returns: v.array(envVarEntryValidator),
  handler: async (ctx, args) => {
    const doc = await findTeamEnvVarDoc(ctx.db, args.teamId);
    if (!doc) return [];
    return doc.vars;
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
    const doc = await findTeamEnvVarDoc(ctx.db, args.teamId);
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
    if (!(await hasTeamAccess(ctx.db, args.teamId, ctx.userId))) {
      throw new Error("Not a team member");
    }

    const doc = await findTeamEnvVarDoc(ctx.db, args.teamId);

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
    if (!(await hasTeamAccess(ctx.db, args.teamId, ctx.userId))) {
      throw new Error("Not a team member");
    }

    const doc = await findTeamEnvVarDoc(ctx.db, args.teamId);
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
