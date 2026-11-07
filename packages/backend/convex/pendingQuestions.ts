import { v } from "convex/values";
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Id } from "./_generated/dataModel";
import type { DatabaseWriter } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { authQuery, authMutation, hasRepoAccess } from "./functions";
import { recordAnsweredQuestion } from "./chatLog";

/**
 * Blocking AskUserQuestion round-trip. A sandbox turn paused inside canUseTool
 * `post`s the question, the UI `getActive`s the unanswered one and writes the
 * user's choice via `answer`, and the sandbox `claimAnswer`s it to resume the
 * turn. `entityId` is the generic session/project/task id, matching how
 * `streaming.ts` keys its state, so this is not tied to any one entity type.
 *
 * Auth: the sandbox (CONVEX_TOKEN, the launching user) posts and claims, the
 * signed-in user reads and answers — each checked against the repo behind
 * `entityId` (see `questionEntityAccess`), so nobody can read, replace or
 * answer another team's question.
 */

/**
 * Deletes all question rows for an entity. Called when the entity's sandbox
 * stops: the paused turn is dead, so an unanswered question can never be
 * claimed — leaving it would hide the composer behind a question the UI may
 * no longer render.
 */
export async function clearPendingQuestionsForEntity(
  db: DatabaseWriter,
  entityId: string,
): Promise<void> {
  const rows = await db
    .query("pendingQuestions")
    .withIndex("by_entity", (q) => q.eq("entityId", entityId))
    .collect();
  for (const row of rows) {
    await db.delete(row._id);
  }
}

/** One-off ops escape hatch: clear stale rows for an entity via `npx convex run`. */
export const clearForEntity = internalMutation({
  args: { entityId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await clearPendingQuestionsForEntity(ctx.db, args.entityId);
    return null;
  },
});

/**
 * The repo behind a question's `entityId`: a session chat, session, quick
 * task, project, run, doc or automation run. Undefined for ids of any other
 * shape, which no UI reads.
 */
async function repoIdForQuestionEntity(
  db: GenericDatabaseReader<DataModel>,
  entityId: string,
): Promise<Id<"githubRepos"> | undefined> {
  const chatId = db.normalizeId("sessionChats", entityId);
  if (chatId) return (await db.get(chatId))?.repoId;
  const sessionId = db.normalizeId("sessions", entityId);
  if (sessionId) return (await db.get(sessionId))?.repoId;
  const taskId = db.normalizeId("agentTasks", entityId);
  if (taskId) return (await db.get(taskId))?.repoId;
  const projectId = db.normalizeId("projects", entityId);
  if (projectId) return (await db.get(projectId))?.repoId;
  const runId = db.normalizeId("agentRuns", entityId);
  if (runId) return (await db.get(runId))?.repoId;
  const docId = db.normalizeId("docs", entityId);
  if (docId) return (await db.get(docId))?.repoId;
  const automationRunId = db.normalizeId("automationRuns", entityId);
  if (automationRunId) return (await db.get(automationRunId))?.repoId;
  return undefined;
}

/**
 * "allowed" / "denied" for an entity with a repo; "unknown" for an id that
 * resolves to none. The sandbox (CONVEX_TOKEN = the launching user, who has
 * access) may still post and claim on unknown ids so no agent kind wedges
 * mid-turn; the UI's read and answer require "allowed".
 */
async function questionEntityAccess(
  db: GenericDatabaseReader<DataModel>,
  entityId: string,
  userId: Id<"users">,
): Promise<"allowed" | "denied" | "unknown"> {
  const repoId = await repoIdForQuestionEntity(db, entityId);
  if (repoId === undefined) return "unknown";
  return (await hasRepoAccess(db, repoId, userId)) ? "allowed" : "denied";
}

const activeQuestionValidator = v.union(
  v.object({ toolUseId: v.string(), payload: v.string() }),
  v.null(),
);

/**
 * Publishes a question for the UI (sandbox token). Clears any prior rows for the
 * entity first — only one turn runs at a time per entity, so a leftover row
 * (e.g. from a cancelled turn) must never shadow the current question.
 */
export const post = authMutation({
  args: { entityId: v.string(), toolUseId: v.string(), payload: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await questionEntityAccess(
      ctx.db,
      args.entityId,
      ctx.userId,
    );
    if (access === "denied") throw new Error("Not authorized");
    const stale = await ctx.db
      .query("pendingQuestions")
      .withIndex("by_entity", (q) => q.eq("entityId", args.entityId))
      .collect();
    for (const row of stale) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.insert("pendingQuestions", {
      entityId: args.entityId,
      toolUseId: args.toolUseId,
      payload: args.payload,
      createdAt: Date.now(),
    });
    return null;
  },
});

/** The oldest unanswered question for an entity, for the UI to render. */
export const getActive = authQuery({
  args: { entityId: v.string() },
  returns: activeQuestionValidator,
  handler: async (ctx, args) => {
    const access = await questionEntityAccess(
      ctx.db,
      args.entityId,
      ctx.userId,
    );
    if (access !== "allowed") return null;
    const rows = await ctx.db
      .query("pendingQuestions")
      .withIndex("by_entity", (q) => q.eq("entityId", args.entityId))
      .collect();
    const pending = rows
      .filter((row) => row.answer === undefined)
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!pending) return null;
    return { toolUseId: pending.toolUseId, payload: pending.payload };
  },
});

/** Records the user's answer (signed-in user), unblocking the paused turn. */
export const answer = authMutation({
  args: { entityId: v.string(), toolUseId: v.string(), answer: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await questionEntityAccess(
      ctx.db,
      args.entityId,
      ctx.userId,
    );
    if (access !== "allowed") throw new Error("Not authorized");
    const existing = await ctx.db
      .query("pendingQuestions")
      .withIndex("by_entity_tool", (q) =>
        q.eq("entityId", args.entityId).eq("toolUseId", args.toolUseId),
      )
      .first();
    if (!existing) return null;
    await ctx.db.patch(existing._id, {
      answer: args.answer,
      answeredAt: Date.now(),
    });
    return null;
  },
});

/** Claims the answer for the sandbox (sandbox token). Deletes the row once taken. */
export const claimAnswer = authMutation({
  args: { entityId: v.string(), toolUseId: v.string() },
  returns: v.object({ answer: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    const access = await questionEntityAccess(
      ctx.db,
      args.entityId,
      ctx.userId,
    );
    if (access === "denied") throw new Error("Not authorized");
    const existing = await ctx.db
      .query("pendingQuestions")
      .withIndex("by_entity_tool", (q) =>
        q.eq("entityId", args.entityId).eq("toolUseId", args.toolUseId),
      )
      .first();
    if (!existing || existing.answer === undefined) {
      return { answer: null };
    }
    const claimed = existing.answer;
    // The row is deleted next; the Log keeps the question and answer.
    await recordAnsweredQuestion(
      ctx,
      args.entityId,
      existing.payload,
      claimed,
    );
    await ctx.db.delete(existing._id);
    return { answer: claimed };
  },
});
