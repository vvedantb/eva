import { v } from "convex/values";
import {
  authMutation,
  authQuery,
  getSessionWithAccess,
  hasRepoAccess,
} from "./functions";
import { assertStandaloneSession } from "./_sessions/owner";
import { stopChat, stopTask } from "./_sessions/stop";
import { ensureOwnerChat } from "./_sessions/ownedSession";
import { mobileChatValidator, resolveMobileChat } from "./_mobile/chatTarget";
import {
  sendSessionChatMessage,
  stickyTurnSettings,
} from "./_sessions/execution";
import {
  createSession,
  stopAndArchiveSession,
  type AuthMutationCtx,
} from "./_sessions/mutations";
import {
  setSessionChatModel,
  setSessionChatTraits,
} from "./_sessionChats/mutations";
import type { Id } from "./_generated/dataModel";
import {
  aiModelValidator,
  normalizeAIModel,
  previewAnnotationValidator,
  reasoningLevelValidator,
} from "./validators";

/**
 * Chat actions both clients call: open a chat by one string `target` (a
 * session chat, quick task or project; see `_mobile/chatTarget.ts`), send,
 * stop, pick a model, start a session and archive one. Each runs its whole
 * decision here, once, so the web and the phone cannot drift. Both apps send,
 * stop and pick models here; the web still opens and starts chats through its
 * own `sessionChats.get` and `sessions.create`. `mobile.*` keeps the old
 * names as aliases for installed APKs.
 */

/** One chat by target, for the chat screen. Null when missing or not allowed. */
export const get = authQuery({
  args: { target: v.string() },
  returns: v.union(mobileChatValidator, v.null()),
  handler: async (ctx, args) => {
    const resolved = await resolveMobileChat(ctx.db, args.target);
    if (!resolved) return null;
    if (!(await hasRepoAccess(ctx.db, resolved.repoId, ctx.userId)))
      return null;
    return resolved.chat;
  },
});

/** Resolves a target the caller may write to (repo access), or throws. */
async function resolveWritableChat(ctx: AuthMutationCtx, target: string) {
  const resolved = await resolveMobileChat(ctx.db, target);
  if (!resolved) throw new Error("Chat not found");
  if (!(await hasRepoAccess(ctx.db, resolved.repoId, ctx.userId)))
    throw new Error("Not authorized");
  return resolved;
}

/** The composer traits a pick may set, as the web traits menu. */
const traitArgs = {
  reasoningLevel: v.optional(reasoningLevelValidator),
  thinkingEnabled: v.optional(v.boolean()),
  use1mContext: v.optional(v.boolean()),
  fastMode: v.optional(v.boolean()),
};

/**
 * Sends a person's message in any chat the apps open (session chat, quick
 * task, project). The server alone decides whether it runs now or queues:
 * behind a running turn, for a free parallel-chat slot, for a usage-limit
 * reset, or for Eva to wake (`sendSessionChatMessage`). A project task that
 * waits on its question takes the message as the answer.
 * `attachmentStorageIds` come from `messages.generateUploadUrl` uploads.
 */
export const send = authMutation({
  args: {
    target: v.string(),
    message: v.string(),
    /** What the chat shows when `message` is a rich agent prompt (a preview annotation). */
    displayContent: v.optional(v.string()),
    /** Preview "Select element" sends: where the annotation points. */
    annotation: v.optional(previewAnnotationValidator),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
    /**
     * The composer's picks for this message (the web sends them). Absent: the
     * chat's sticky model, traits and account (the phone).
     */
    settings: v.optional(
      v.object({
        model: aiModelValidator,
        ...traitArgs,
        /** Absent is Team. */
        providerAccountId: v.optional(v.id("userProviderAccounts")),
      }),
    ),
    /** The proposed plan this message implements: marked implemented. */
    sourceProposedPlanId: v.optional(v.id("proposedPlans")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = args.message.trim();
    if (!message) return null;
    const { chat, entity } = await resolveWritableChat(ctx, args.target);
    if (!chat.canReply) throw new Error("This chat is closed");
    // A task's or project's first send creates its session chat; later sends
    // resolve as that session chat directly (`resolveMobileChat`).
    const context =
      entity.kind === "session"
        ? entity.context
        : await ensureOwnerChat(ctx, entity);
    if (args.sourceProposedPlanId !== undefined) {
      await markPlanImplementedIn(
        ctx,
        args.sourceProposedPlanId,
        context.session._id,
      );
    }
    const { attachmentStorageIds } = args;
    await sendSessionChatMessage(ctx, {
      context,
      userId: ctx.userId,
      content: message,
      displayContent: args.displayContent?.trim() || undefined,
      annotation: args.annotation,
      settings: args.settings
        ? { ...args.settings, attachmentStorageIds }
        : stickyTurnSettings(
            context.chat,
            normalizeAIModel(context.chat.lastModel ?? chat.model),
            attachmentStorageIds,
          ),
    });
    return null;
  },
});

/** Marks a plan implemented by a message sent in the plan's own session. */
async function markPlanImplementedIn(
  ctx: AuthMutationCtx,
  planId: Id<"proposedPlans">,
  sessionId: Id<"sessions">,
): Promise<void> {
  const plan = await ctx.db.get(planId);
  if (!plan || plan.sessionId !== sessionId) return;
  const now = Date.now();
  await ctx.db.patch(planId, {
    implementedAt: now,
    implementationSessionId: sessionId,
    updatedAt: now,
  });
}

/**
 * The composer model picker on the web and the phone: sets a chat's sticky
 * model and traits, which `send` then uses. A model pick reconciles the
 * sticky account to the model's provider (`setSessionChatModel`). A task's or
 * project's pick lands on its session chat, created on first need.
 */
export const setModel = authMutation({
  args: {
    target: v.string(),
    model: v.optional(aiModelValidator),
    ...traitArgs,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { target, model, ...traits } = args;
    const { chat, entity } = await resolveWritableChat(ctx, target);
    if (!chat.canReply) throw new Error("This chat is closed");
    switch (entity.kind) {
      case "session":
        if (model !== undefined)
          await setSessionChatModel(ctx, entity.context, model);
        await setSessionChatTraits(ctx, entity.context.chat._id, traits);
        return null;
      case "task":
      case "project": {
        // The pick lands on the owner's session chat, created on first need.
        const context = await ensureOwnerChat(ctx, entity);
        if (model !== undefined) await setSessionChatModel(ctx, context, model);
        await setSessionChatTraits(ctx, context.chat._id, traits);
        return null;
      }
    }
  },
});

/**
 * The chat Stop button, on the web, the phone and MCP: stops the exact chat
 * the target names (its open turn) and the task run shown in it (a quick or
 * project task's). What was queued before it waits for Steer. Name the task
 * when its chat may not exist yet (a quick task's first run).
 */
export const stop = authMutation({
  args: { target: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { entity } = await resolveWritableChat(ctx, args.target);
    switch (entity.kind) {
      case "session":
        await stopChat(ctx, entity.context);
        return null;
      case "task":
        await stopTask(ctx, entity.task);
        return null;
      case "project":
        // No session chat yet (`resolveMobileChat` found none): nothing runs,
        // and stopping never creates one.
        return null;
    }
  },
});

/**
 * Starts a session from the phone, as the web sessions landing composer does:
 * `prompt` is the first message. The composer footer's model, traits, account
 * and base branch are optional; each absent one is the default, as on the web.
 * Open the returned `sessionId` as the chat target.
 */
export const start = authMutation({
  args: {
    repoId: v.id("githubRepos"),
    prompt: v.string(),
    /** The session title; a fork passes `forkThreadTitle`. Default: generated from the prompt, as on the web. */
    title: v.optional(v.string()),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
    model: v.optional(aiModelValidator),
    ...traitArgs,
    /** The model picker's account, as the web landing sends it: null is Team; absent is the user's default. */
    providerAccountId: v.optional(
      v.union(v.id("userProviderAccounts"), v.null()),
    ),
    baseBranch: v.optional(v.string()),
    /** "Stack a new session" on a pull request: the session's PR joins that PR's stack, as the web composer sends. */
    stackOnPrNumber: v.optional(v.number()),
  },
  returns: v.object({ sessionId: v.id("sessions"), numId: v.number() }),
  handler: async (ctx, { prompt: rawPrompt, ...args }) => {
    const prompt = rawPrompt.trim();
    if (!prompt) throw new Error("Write a prompt first");
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId)))
      throw new Error("Not authorized");
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
 * Archives a session as the web Archive does (`useArchiveSession`): stops the
 * sandbox when one is up, then `sessions.archive` (cold storage, open PRs
 * closed). One call, because the phone does not know the sandbox id.
 * Rename and Unarchive are the web `sessions.update` and `sessions.unarchive`.
 */
export const archive = authMutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await getSessionWithAccess(
      ctx.db,
      args.sessionId,
      ctx.userId,
    );
    assertStandaloneSession(session, "be archived on its own");
    await stopAndArchiveSession(ctx, session);
    return null;
  },
});
