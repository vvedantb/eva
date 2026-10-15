import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { authMutation, authQuery, hasRepoAccess } from "./functions";
import { arenaScenarioFields } from "./validators";

/** Title and instructions are free text; caps keep one scenario prompt-sized. */
const MAX_TITLE_LENGTH = 200;
const MAX_INSTRUCTIONS_LENGTH = 4000;

const scenarioValidator = v.object({
  _id: v.id("arenaScenarios"),
  _creationTime: v.number(),
  ...arenaScenarioFields,
});

/** Loads a doc the caller may edit, or throws the same not-found for both cases. */
async function requireDocAccess(
  ctx: MutationCtx,
  docId: Id<"docs">,
  userId: Id<"users">,
): Promise<Doc<"docs">> {
  const doc = await ctx.db.get(docId);
  if (!doc || !(await hasRepoAccess(ctx.db, doc.repoId, userId))) {
    throw new Error("Document not found");
  }
  return doc;
}

function cleanScenario(input: { title: string; instructions: string }): {
  title: string;
  instructions: string;
} {
  const title = input.title.trim().slice(0, MAX_TITLE_LENGTH);
  const instructions = input.instructions
    .trim()
    .slice(0, MAX_INSTRUCTIONS_LENGTH);
  if (!title) throw new Error("Give the scenario a title");
  if (!instructions) throw new Error("Describe what the scenario checks");
  return { title, instructions };
}

/** Browser scenarios for one doc, oldest first (the order they run in). */
export const listByDoc = authQuery({
  args: { docId: v.id("docs") },
  returns: v.array(scenarioValidator),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.docId);
    if (!doc || !(await hasRepoAccess(ctx.db, doc.repoId, ctx.userId))) {
      return [];
    }
    return await ctx.db
      .query("arenaScenarios")
      .withIndex("by_doc", (q) => q.eq("docId", args.docId))
      .collect();
  },
});

export const create = authMutation({
  args: { docId: v.id("docs"), title: v.string(), instructions: v.string() },
  returns: v.id("arenaScenarios"),
  handler: async (ctx, args) => {
    const doc = await requireDocAccess(ctx, args.docId, ctx.userId);
    const now = Date.now();
    return await ctx.db.insert("arenaScenarios", {
      repoId: doc.repoId,
      docId: doc._id,
      ...cleanScenario(args),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = authMutation({
  args: {
    scenarioId: v.id("arenaScenarios"),
    title: v.string(),
    instructions: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const scenario = await ctx.db.get(args.scenarioId);
    if (!scenario) throw new Error("Scenario not found");
    await requireDocAccess(ctx, scenario.docId, ctx.userId);
    await ctx.db.patch(args.scenarioId, {
      ...cleanScenario(args),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const remove = authMutation({
  args: { scenarioId: v.id("arenaScenarios") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const scenario = await ctx.db.get(args.scenarioId);
    if (!scenario) return null;
    await requireDocAccess(ctx, scenario.docId, ctx.userId);
    await ctx.db.delete(args.scenarioId);
    return null;
  },
});

/**
 * Turns browser runs on every PR on or off for a doc. The caller becomes the
 * run owner: PR runs launch agents with their credentials.
 */
export const setPrRuns = authMutation({
  args: { docId: v.id("docs"), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireDocAccess(ctx, args.docId, ctx.userId);
    await ctx.db.patch(args.docId, {
      arenaPrRunsUserId: args.enabled ? ctx.userId : undefined,
    });
    return null;
  },
});

// --- Agent drafting (called from arenaActions.draftScenarios) ---

export const getDraftContext = internalQuery({
  args: { docId: v.id("docs") },
  returns: v.union(
    v.null(),
    v.object({
      repoId: v.id("githubRepos"),
      title: v.string(),
      content: v.string(),
      userFlows: v.array(
        v.object({ name: v.string(), steps: v.array(v.string()) }),
      ),
      existingTitles: v.array(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.docId);
    if (!doc) return null;
    const existing = await ctx.db
      .query("arenaScenarios")
      .withIndex("by_doc", (q) => q.eq("docId", args.docId))
      .collect();
    return {
      repoId: doc.repoId,
      title: doc.title,
      content: doc.content,
      userFlows: doc.userFlows ?? [],
      existingTitles: existing.map((s) => s.title),
    };
  },
});

/** Appends drafted scenarios; the user edits or deletes them afterwards. */
export const insertDrafted = internalMutation({
  args: {
    docId: v.id("docs"),
    scenarios: v.array(
      v.object({ title: v.string(), instructions: v.string() }),
    ),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.docId);
    if (!doc) return 0;
    const now = Date.now();
    let inserted = 0;
    for (const scenario of args.scenarios) {
      const title = scenario.title.trim().slice(0, MAX_TITLE_LENGTH);
      const instructions = scenario.instructions
        .trim()
        .slice(0, MAX_INSTRUCTIONS_LENGTH);
      if (!title || !instructions) continue;
      await ctx.db.insert("arenaScenarios", {
        repoId: doc.repoId,
        docId: doc._id,
        title,
        instructions,
        createdAt: now,
        updatedAt: now,
      });
      inserted++;
    }
    return inserted;
  },
});
