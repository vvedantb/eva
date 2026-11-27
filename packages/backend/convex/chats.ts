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
import { findWorkChat } from "./_sessions/ownerState";
import { mobileChatValidator, resolveMobileChat } from "./_mobile/chatTarget";
import {
  sendOwnerChatMessage,
  sendStickyChatMessage,
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
import {
  aiModelValidator,
  normalizeAIModel,
  reasoningLevelValidator,
} from "./validators";

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

async function resolveWritableChat(ctx: AuthMutationCtx, target: string) {
  const resolved = await resolveMobileChat(ctx.db, target);
  if (!resolved) throw new Error("Chat not found");
  if (!(await hasRepoAccess(ctx.db, resolved.repoId, ctx.userId)))
    throw new Error("Not authorized");
  return resolved;
}

/**
 * Replies in any chat the app opens (session chat, quick task, project) with
 * the chat's sticky model and traits. Sends at once when the chat is idle and
 * queues behind a running turn otherwise, like the web composer.
 * `attachmentStorageIds` come from `messages.generateUploadUrl` uploads.
 */
export const send = authMutation({
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
    const { attachmentStorageIds } = args;
    switch (entity.kind) {
      case "session":
        await sendStickyChatMessage(ctx, {
          context: entity.context,
          model: normalizeAIModel(chat.model),
          userId: ctx.userId,
          content: message,
          attachmentStorageIds,
        });
        return null;
      case "task":
      case "project":
        await sendOwnerChatMessage(ctx, {
          entity,
          userId: ctx.userId,
          content: message,
          attachmentStorageIds,
        });
        return null;
    }
  },
});

const traitArgs = {
  reasoningLevel: v.optional(reasoningLevelValidator),
  thinkingEnabled: v.optional(v.boolean()),
  use1mContext: v.optional(v.boolean()),
  fastMode: v.optional(v.boolean()),
};

/**
 * The composer model picker: sets a chat's sticky model and traits, which
 * `sendMessage` then uses. Shares the writes of the web picker's mutations
 * (`sessionChats.setModel` / `setTraits`), so a pick reconciles the sticky
 * account as on the web. A task's or project's pick lands on its session
 * chat, created on first need.
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
        const context = await ensureOwnerChat(ctx, entity);
        if (model !== undefined) await setSessionChatModel(ctx, context, model);
        await setSessionChatTraits(ctx, context.chat._id, traits);
        return null;
      }
    }
  },
});

/**
 * The Stop button: the web chat Stop (`sessions.stopChatTurn`) for a mobile
 * target. Stops the chat's turn and its task's run, then starts its queue.
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
      case "project": {
        const found = await findWorkChat(ctx.db, entity);
        if (found) await stopChat(ctx, found);
        return null;
      }
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
    title: v.optional(v.string()),
    attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
    model: v.optional(aiModelValidator),
    ...traitArgs,
    providerAccountId: v.optional(
      v.union(v.id("userProviderAccounts"), v.null()),
    ),
    baseBranch: v.optional(v.string()),
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
