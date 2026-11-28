import { v, type Infer } from "convex/values";
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

const traitArgs = {
  reasoningLevel: v.optional(reasoningLevelValidator),
  thinkingEnabled: v.optional(v.boolean()),
  use1mContext: v.optional(v.boolean()),
  fastMode: v.optional(v.boolean()),
};

const sendArgs = {
  target: v.string(),
  message: v.string(),
  displayContent: v.optional(v.string()),
  annotation: v.optional(previewAnnotationValidator),
  attachmentStorageIds: v.optional(v.array(v.id("_storage"))),
  settings: v.optional(
    v.object({
      model: aiModelValidator,
      ...traitArgs,
      providerAccountId: v.optional(v.id("userProviderAccounts")),
    }),
  ),
  sourceProposedPlanId: v.optional(v.id("proposedPlans")),
};

const sendArgsValidator = v.object(sendArgs);

/**
 * The whole decision of `send` for one caller. The web and phone mutation and
 * the preview-link HTTP route (`previewComments.sendForUser`) both run it, so
 * a message from a direct sandbox link takes the same path as one from the app.
 */
export async function sendChatMessage(
  ctx: AuthMutationCtx,
  args: Infer<typeof sendArgsValidator>,
): Promise<null> {
  const message = args.message.trim();
  if (!message) return null;
  const { chat, entity } = await resolveWritableChat(ctx, args.target);
  if (!chat.canReply) throw new Error("This chat is closed");
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
}

/**
 * Sends a person's message in any chat the apps open (session chat, quick
 * task, project). The server alone decides whether it runs now or queues:
 * behind a running turn, for a free parallel-chat slot, for a usage-limit
 * reset, or for Eva to wake (`sendSessionChatMessage`). A project task that
 * waits on its question takes the message as the answer.
 * `attachmentStorageIds` come from `messages.generateUploadUrl` uploads.
 */
export const send = authMutation({
  args: sendArgs,
  returns: v.null(),
  handler: (ctx, args) => sendChatMessage(ctx, args),
});

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
        return null;
    }
  },
});

/**
 * Starts a session with `prompt` as its first message: the sessions landing
 * composer on the web and the phone, and every "start a session for this"
 * button. The composer footer's model, traits, account and base branch are
 * optional; each absent one is the default. MCP `create_session` starts its
 * sessions here too. Open the returned `sessionId` (or `numId`) as the chat.
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
    linkedRepoIds: v.optional(v.array(v.id("githubRepos"))),
    repoGroupId: v.optional(v.id("repoGroups")),
    installDependencies: v.optional(v.boolean()),
    fromSessionId: v.optional(v.id("sessions")),
    sentViaOrchestrator: v.optional(v.boolean()),
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
