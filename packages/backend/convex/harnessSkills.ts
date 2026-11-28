import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { authQuery } from "./functions";
import { aiProviderValidator } from "./_validators/aiModels";
import { harnessSkillValidator } from "./_validators/tableFields";
import {
  filterHarnessCommands,
  isHarnessCatalogUnchanged,
} from "./_harnessSkills/filter";

const catalogValidator = v.object({
  cliVersion: v.string(),
  skills: v.array(harnessSkillValidator),
});

/** The catalog for a provider, or null before any sandbox has reported one. */
export const getForProvider = authQuery({
  args: { provider: aiProviderValidator },
  returns: v.union(v.null(), catalogValidator),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("harnessSkillCatalogs")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider))
      .unique();
    return row ? { cliVersion: row.cliVersion, skills: row.skills } : null;
  },
});

/**
 * Records what a sandbox's harness CLI reported at session start. Internal:
 * the only writer is the HMAC-verified `/api/harness-skills/report` route in
 * `http.ts`, so a signature only launched sandboxes hold gates this global row.
 *
 * A no-op when nothing changed: every daemon boot reports, and this row is
 * global, so writing unconditionally would serialize fleet-wide.
 */
export const upsertForProvider = internalMutation({
  args: {
    provider: aiProviderValidator,
    cliVersion: v.string(),
    commands: v.array(harnessSkillValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const skills = filterHarnessCommands(args.commands);
    if (skills.length === 0) return null;

    const existing = await ctx.db
      .query("harnessSkillCatalogs")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider))
      .unique();
    const next = { cliVersion: args.cliVersion, skills };
    if (existing && isHarnessCatalogUnchanged(existing, next)) return null;

    if (existing) {
      await ctx.db.patch(existing._id, { ...next, updatedAt: Date.now() });
      return null;
    }
    await ctx.db.insert("harnessSkillCatalogs", {
      provider: args.provider,
      ...next,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Explicit admin/reset path for a bad or obsolete provider catalog. */
export const clearForProvider = internalMutation({
  args: { provider: aiProviderValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("harnessSkillCatalogs")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider))
      .unique();
    if (row) await ctx.db.delete(row._id);
    return null;
  },
});

const REPORT_TOKEN_GC_BATCH = 20;

/** Registers a random per-launch report token generated in the Node action. */
export const issueReportToken = internalMutation({
  args: {
    tokenHash: v.string(),
    provider: aiProviderValidator,
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
    expiresAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("harnessSkillReportTokens", args);
    const expired = await ctx.db
      .query("harnessSkillReportTokens")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", Date.now()))
      .take(REPORT_TOKEN_GC_BATCH);
    for (const row of expired) await ctx.db.delete(row._id);
    return null;
  },
});

/** Atomically consumes a token, so a leaked sandbox value cannot be replayed. */
export const consumeReportToken = internalMutation({
  args: {
    tokenHash: v.string(),
    provider: aiProviderValidator,
    sandboxId: v.string(),
    repoId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("harnessSkillReportTokens")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (!row) return false;
    await ctx.db.delete(row._id);
    return (
      row.expiresAt >= Date.now() &&
      row.provider === args.provider &&
      row.sandboxId === args.sandboxId &&
      String(row.repoId) === args.repoId
    );
  },
});
