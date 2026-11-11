import { v } from "convex/values";
import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import type { DatabaseWriter, MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { authQuery, authMutation, hasRepoAccess } from "./functions";
import { recordAnsweredQuestion } from "./chatLog";
import { parsePendingQuestion } from "@eva/shared/pendingQuestion";
import { resolveMobileChat } from "./_mobile/chatTarget";
import { schedulePush } from "./push";

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

async function listEntityQuestions(
  db: GenericDatabaseReader<DataModel>,
  entityId: string,
): Promise<Doc<"pendingQuestions">[]> {
  return await db
    .query("pendingQuestions")
    .withIndex("by_entity", (q) => q.eq("entityId", entityId))
    .collect();
}

/** The `messages.parentId` a question's `entityId` names, if it is a chat. */
function chatMessageParentId(
  db: GenericDatabaseReader<DataModel>,
  entityId: string,
): Doc<"messages">["parentId"] | null {
  return (
    db.normalizeId("sessionChats", entityId) ??
    db.normalizeId("agentTasks", entityId) ??
    db.normalizeId("projects", entityId) ??
    db.normalizeId("sessions", entityId)
  );
}

/**
 * Called when the turn that asked is gone (sandbox stop, timeout, stall): its
 * rows can never be claimed, and a row left behind hides the composer. Moves
 * the question onto the chat's last message as `pendingQuestion` — the field
 * the after-turn question card reads — then deletes the rows. Answering that
 * card sends a normal chat message, which resumes the sandbox and the agent
 * session. The question moves only while the asker's assistant message is
 * still the latest one; if the user already wrote since, it is just dropped.
 */
export async function detachPendingQuestions(
  db: DatabaseWriter,
  entityId: string,
): Promise<void> {
  const rows = await listEntityQuestions(db, entityId);
  if (rows.length === 0) return;
  const latestQuestion = rows.reduce((a, b) =>
    b.createdAt > a.createdAt ? b : a,
  );
  const parentId = chatMessageParentId(db, entityId);
  const last = parentId
    ? await db
        .query("messages")
        .withIndex("by_parent", (q) => q.eq("parentId", parentId))
        .order("desc")
        .first()
    : null;
  if (last && last.role === "assistant" && last.isSystemAlert !== true) {
    await db.patch(last._id, { pendingQuestion: latestQuestion.payload });
  }
  for (const row of rows) {
    await db.delete(row._id);
  }
}

/**
 * The chat's open after-turn question: the newest message is an assistant
 * reply that carries `pendingQuestion`. The card renders only there, so any
 * later message — the answer, or anything else — closes it.
 */
export async function findOpenChatQuestion(
  db: GenericDatabaseReader<DataModel>,
  parentId: Doc<"messages">["parentId"],
): Promise<Doc<"messages"> | null> {
  const tail = await db
    .query("messages")
    .withIndex("by_parent", (q) => q.eq("parentId", parentId))
    .order("desc")
    .first();
  const open =
    tail !== null &&
    tail.role === "assistant" &&
    tail.isSystemAlert !== true &&
    Boolean(tail.pendingQuestion);
  return open ? tail : null;
}

/** One-off ops escape hatch: detach stale rows for an entity via `npx convex run`. */
export const clearForEntity = internalMutation({
  args: { entityId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await detachPendingQuestions(ctx.db, args.entityId);
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
    const isRepost = stale.some((row) => row.toolUseId === args.toolUseId);
    for (const row of stale) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.insert("pendingQuestions", {
      entityId: args.entityId,
      toolUseId: args.toolUseId,
      payload: args.payload,
      createdAt: Date.now(),
    });
    // The sandbox posts as the user who launched the turn: tell their phone.
    // A re-post of the same question (a retried call) does not push again.
    if (!isRepost) {
      const resolved = await resolveMobileChat(ctx.db, args.entityId);
      if (resolved) {
        await schedulePush(ctx, {
          userId: ctx.userId,
          title: resolved.chat.title,
          body: parsePendingQuestion(args.payload)?.[0]?.question,
          data: { target: args.entityId },
        });
      }
    }
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

const claimArgs = { entityId: v.string(), toolUseId: v.string() };
const claimResult = v.object({ answer: v.union(v.string(), v.null()) });

/**
 * Takes the user's answer for the sandbox: deletes the row once taken. With
 * `release`, the waiting turn is giving up, so an unanswered row is deleted
 * too — in the same mutation, so an answer that lands at the deadline is
 * still claimed rather than lost.
 */
async function claimQuestion(
  ctx: MutationCtx & { userId: Id<"users"> },
  args: { entityId: string; toolUseId: string },
  mode: "claim" | "release",
): Promise<{ answer: string | null }> {
  const access = await questionEntityAccess(ctx.db, args.entityId, ctx.userId);
  if (access === "denied") throw new Error("Not authorized");
  const existing = await ctx.db
    .query("pendingQuestions")
    .withIndex("by_entity_tool", (q) =>
      q.eq("entityId", args.entityId).eq("toolUseId", args.toolUseId),
    )
    .first();
  if (!existing) return { answer: null };
  if (existing.answer === undefined) {
    if (mode === "release") await ctx.db.delete(existing._id);
    return { answer: null };
  }
  const claimed = existing.answer;
  // The row is deleted next; the Log keeps the question and answer.
  await recordAnsweredQuestion(ctx, args.entityId, existing.payload, claimed);
  await ctx.db.delete(existing._id);
  return { answer: claimed };
}

/** Claims the answer for the sandbox (sandbox token). Deletes the row once taken. */
export const claimAnswer = authMutation({
  args: claimArgs,
  returns: claimResult,
  handler: async (ctx, args) => await claimQuestion(ctx, args, "claim"),
});

/**
 * The paused turn stops waiting (sandbox token): claims an answer that just
 * landed, else deletes the row. The daemon then ends the turn with the
 * question saved on its message, so the card stays on screen.
 */
export const release = authMutation({
  args: claimArgs,
  returns: claimResult,
  handler: async (ctx, args) => await claimQuestion(ctx, args, "release"),
});
