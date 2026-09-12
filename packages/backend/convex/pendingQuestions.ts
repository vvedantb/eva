import { v } from "convex/values";
import type { DatabaseWriter } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { authQuery, authMutation } from "./functions";
import { assertEntityAccess, hasEntityAccess } from "./_auth/entityAccess";
import {
  rejectSandboxCaller,
  requireSandboxCaller,
} from "./_auth/sandboxIdentity";

/**
 * Blocking AskUserQuestion round-trip. A sandbox turn paused inside canUseTool
 * `post`s the question, the UI `getActive`s the unanswered one and writes the
 * user's choice via `answer`, and the sandbox `claimAnswer`s it to resume the
 * turn. `entityId` is the generic session/project/task id, matching how
 * `streaming.ts` keys its state, so this is not tied to any one entity type.
 *
 * Auth mirrors `streaming.ts`: sandbox CONVEX_TOKEN or the signed-in user,
 * plus `assertEntityAccess` so a guessed entity id is not enough.
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
    await requireSandboxCaller(ctx);
    await assertEntityAccess(ctx.db, args.entityId, ctx.userId);
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
    if (!(await hasEntityAccess(ctx.db, args.entityId, ctx.userId))) {
      return null;
    }
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
    await rejectSandboxCaller(ctx);
    await assertEntityAccess(ctx.db, args.entityId, ctx.userId);
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
    await requireSandboxCaller(ctx);
    await assertEntityAccess(ctx.db, args.entityId, ctx.userId);
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
    await ctx.db.delete(existing._id);
    return { answer: claimed };
  },
});
