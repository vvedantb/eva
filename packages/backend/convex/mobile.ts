import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { authMutation, authQuery, hasRepoAccess } from "./functions";
import { awaitingAnswerEntityIdsForRepo } from "./_chat/turnProjection";
import { gatherAccessibleRepos } from "./_githubRepos/helpers";
import {
  mobileChatValidator,
  repoLabel,
  resolveMobileChat,
} from "./_mobile/chatTarget";
import { cancelChatExecution, sendSessionChatMessage } from "./_sessions/execution";
import { createSession, type AuthMutationCtx } from "./_sessions/mutations";
import { cancelTaskChatExecution, sendTaskChatMessage } from "./agentTaskChatWorkflow";
import { cancelProjectChatExecution, sendProjectChatMessage } from "./projectChatWorkflow";
import { cancelTaskRun } from "./_taskWorkflow/publicMutations";
import {
  aiModelValidator,
  launchTraitsFromStored,
  normalizeAIModel,
  prStateValidator,
  reasoningLevelValidator,
  sessionStatusValidator,
} from "./validators";

/**
 * API for the Eva mobile app (apps/mobile). The app opens every chat by one
 * string `target` (see `_mobile/chatTarget.ts`). Writes reuse the web's server
 * paths, so a phone send or stop behaves like the web composer's.
 */

/** Sessions read per repo; the list is "what is going on now", not history. */
const SESSIONS_PER_REPO = 15;
/** Rows in the whole chat list. */
const CHAT_LIST_LIMIT = 60;

/** One chat by target, for the chat screen. Null when missing or not allowed. */
export const getChat = authQuery({
  args: { target: v.string() },
  returns: v.union(mobileChatValidator, v.null()),
  handler: async (ctx, args) => {
    const resolved = await resolveMobileChat(ctx.db, args.target);
    if (!resolved) return null;
    if (!(await hasRepoAccess(ctx.db, resolved.repoId, ctx.userId))) return null;
    return resolved.chat;
  },
});

/** Resolves a target the caller may write to, or throws. */
async function resolveWritableChat(ctx: AuthMutationCtx, target: string) {
  const resolved = await resolveMobileChat(ctx.db, target);
  if (!resolved) throw new Error("Chat not found");
  if (!(await hasRepoAccess(ctx.db, resolved.repoId, ctx.userId))) throw new Error("Not authorized");
  return resolved;
}

/** The sticky composer traits a phone reply carries (the app has no traits menu). */
function storedTraits(
  model: string,
  row: Pick<Doc<"sessionChats">, "lastReasoningLevel" | "lastThinkingEnabled" | "lastUse1mContext" | "lastFastMode">,
) {
  return launchTraitsFromStored(model, {
    reasoningLevel: row.lastReasoningLevel,
    thinkingEnabled: row.lastThinkingEnabled,
    use1mContext: row.lastUse1mContext,
    fastMode: row.lastFastMode,
  });
}

/**
 * Replies in any chat the app opens (session chat, quick task, project) with
 * the chat's sticky model and traits. Sends at once when the chat is idle and
 * queues behind a running turn otherwise, like the web composer.
 * `attachmentStorageIds` come from `messages.generateUploadUrl` uploads.
 */
export const sendMessage = authMutation({
  args: {
    target: v.string(),
    message: v.string(),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = args.message.trim();
    if (!message) return null;
    const { chat, entity } = await resolveWritableChat(ctx, args.target);
    if (!chat.canReply) throw new Error("This chat is closed");
    const model = normalizeAIModel(chat.model);
    const { attachmentStorageIds } = args;
    switch (entity.kind) {
      case "session":
        await sendSessionChatMessage(ctx, {
          context: entity.context,
          userId: ctx.userId,
          content: message,
          settings: {
            model,
            ...storedTraits(model, entity.context.chat),
            providerAccountId: entity.context.chat.providerAccountId,
            attachmentStorageIds,
          },
        });
        return null;
      case "task":
        await sendTaskChatMessage(ctx, entity.task, {
          message,
          userId: ctx.userId,
          model,
          ...storedTraits(model, entity.task),
          attachmentStorageIds,
        });
        return null;
      case "project":
        await sendProjectChatMessage(ctx, entity.project, {
          message,
          userId: ctx.userId,
          model,
          ...storedTraits(model, entity.project),
          attachmentStorageIds,
        });
        return null;
    }
  },
});

/** The composer traits a pick may set, as the web traits menu. */
const traitArgs = {
  reasoningLevel: v.optional(reasoningLevelValidator),
  thinkingEnabled: v.optional(v.boolean()),
  use1mContext: v.optional(v.boolean()),
  fastMode: v.optional(v.boolean()),
};

/**
 * The composer model picker: sets a chat's sticky model and traits, which
 * `sendMessage` then uses. Runs the web picker's own mutations, so a pick
 * reconciles the sticky account as it does on the web. Session and project
 * chats only: the web task chat picks `agentTasks.model`, which is not the
 * `lastChatModel` a phone task reply uses.
 */
export const setChatModel = authMutation({
  args: { target: v.string(), model: v.optional(aiModelValidator), ...traitArgs },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { target, model, ...traits } = args;
    const { chat, entity } = await resolveWritableChat(ctx, target);
    if (!chat.canReply) throw new Error("This chat is closed");
    switch (entity.kind) {
      case "session": {
        const chatId = entity.context.chat._id;
        if (model !== undefined) await ctx.runMutation(api.sessionChats.setModel, { chatId, model });
        await ctx.runMutation(api.sessionChats.setTraits, { chatId, ...traits });
        return null;
      }
      case "project": {
        const id = entity.project._id;
        if (model !== undefined) await ctx.runMutation(api.projects.setChatModel, { id, model });
        await ctx.runMutation(api.projects.setTraits, { id, ...traits });
        return null;
      }
      case "task":
        throw new Error("Pick a quick task's model on the web");
    }
  },
});

/** The Stop button: cancels the chat's running turn and starts its queue. */
export const stopTurn = authMutation({
  args: { target: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { entity } = await resolveWritableChat(ctx, args.target);
    switch (entity.kind) {
      case "session":
        await cancelChatExecution(ctx, entity.context);
        return null;
      case "task": {
        const { task } = entity;
        // A quick task's first run is an agent run, not a chat turn: the web
        // Stop calls `taskWorkflow.cancelExecution` for it.
        const isFirstRun =
          task.projectId === undefined &&
          task.activeWorkflowId !== undefined &&
          task.activeChatWorkflowId === undefined &&
          task.pendingTurn === undefined;
        if (isFirstRun) await cancelTaskRun(ctx, task);
        else await cancelTaskChatExecution(ctx, task);
        return null;
      }
      case "project":
        await cancelProjectChatExecution(ctx, entity.project);
        return null;
    }
  },
});

/**
 * Starts a session from the phone, as the web sessions landing composer does:
 * `prompt` is the first message. The composer footer's model, traits and base
 * branch are optional; each absent one is the repo default, as on the web.
 * Open the returned `sessionId` as the chat target.
 */
export const startSession = authMutation({
  args: {
    repoId: v.id("githubRepos"),
    prompt: v.string(),
    /** The session title; a fork passes `forkThreadTitle`. Default: generated from the prompt, as on the web. */
    title: v.optional(v.string()),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
    model: v.optional(aiModelValidator),
    ...traitArgs,
    baseBranch: v.optional(v.string()),
  },
  returns: v.object({ sessionId: v.id("sessions"), numId: v.number() }),
  handler: async (ctx, { prompt: rawPrompt, ...args }) => {
    const prompt = rawPrompt.trim();
    if (!prompt) throw new Error("Write a prompt first");
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) throw new Error("Not authorized");
    const repo = await ctx.db.get(args.repoId);
    if (!repo) throw new Error("Repository not found");
    return await createSession(ctx, {
      ...args,
      message: prompt,
      // `createSession` needs a model to queue the first message; the web
      // composer sends the same normalised repo default.
      model: args.model ?? normalizeAIModel(repo.defaultModel),
    });
  },
});

/**
 * Recent sessions across every repo the user can access, newest first: open
 * ones by default, archived ones with `archived: true` (the web Active and
 * Archived tabs).
 */
export const listChats = authQuery({
  args: { archived: v.optional(v.boolean()) },
  returns: v.array(
    v.object({
      sessionId: v.id("sessions"),
      title: v.string(),
      repoLabel: v.string(),
      status: sessionStatusValidator,
      updatedAt: v.number(),
      /** An agent in one of its chats waits on your answer (as the web sidebar shows). */
      isAwaitingAnswer: v.boolean(),
      /** The session's primary PR and its rolled-up state, as the web sidebar row shows. */
      prUrl: v.optional(v.string()),
      prState: v.optional(prStateValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const repos = await gatherAccessibleRepos(ctx.db, ctx.userId, false);
    const perRepo = await Promise.all(
      repos.map(async (repo) => {
        // Open sessions store `archived` as undefined or false; read both.
        const readSessions = (archived: boolean | undefined) =>
          ctx.db
            .query("sessions")
            .withIndex("by_repo_archived_and_deleted", (q) =>
              q.eq("repoId", repo._id).eq("archived", archived).eq("deletedAt", undefined),
            )
            .order("desc")
            .take(SESSIONS_PER_REPO);
        const groups = await Promise.all(
          args.archived === true ? [readSessions(true)] : [readSessions(undefined), readSessions(false)],
        );
        return groups.flat().map((session) => ({ session, repo }));
      }),
    );
    const rows = perRepo
      .flat()
      .map((row) => ({ ...row, updatedAt: row.session.updatedAt ?? row.session._creationTime }))
      .toSorted((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, CHAT_LIST_LIMIT);
    // Question state only for repos that made the list, not every repo read.
    const listedRepoIds = [...new Set(rows.map((row) => row.repo._id))];
    const awaiting = new Map(
      await Promise.all(
        listedRepoIds.map(
          async (repoId): Promise<[Id<"githubRepos">, ReadonlySet<string>]> => [
            repoId,
            await awaitingAnswerEntityIdsForRepo(ctx.db, repoId),
          ],
        ),
      ),
    );
    return rows.map(({ session, repo, updatedAt }) => ({
      sessionId: session._id,
      title: session.title,
      repoLabel: repoLabel(repo),
      status: session.status,
      updatedAt,
      isAwaitingAnswer: awaiting.get(repo._id)?.has(String(session._id)) === true,
      prUrl: session.prUrl,
      prState: session.prState,
    }));
  },
});
