import { v } from "convex/values";
import { internal } from "../_generated/api";
import { authMutation, hasRepoAccess } from "../functions";
import { aiModelValidator, reasoningLevelValidator } from "../validators";
import {
  assertProviderAccountUsableBy,
  reconcileProviderAccountForModel,
} from "../_userProviderAccounts/defaults";
import { cancelChatExecution } from "../_sessions/execution";
import {
  createSessionChat,
  ensureMainChat,
  getSessionChatOrThrow,
  sessionChatValidator,
} from "./helpers";

/**
 * Page-open hook: gives a session predating chats its Main chat (and moves
 * its transcript onto it). Idempotent and cheap once the chat exists.
 */
export const ensureMain = authMutation({
  args: { sessionId: v.id("sessions") },
  returns: sessionChatValidator,
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    return await ensureMainChat(ctx, session);
  },
});

/** Opens a parallel chat in a session, inheriting the active chat's settings. */
export const create = authMutation({
  args: {
    sessionId: v.id("sessions"),
    title: v.optional(v.string()),
    /** The chat the user pressed `+` on; its model and account carry over. */
    fromChatId: v.optional(v.id("sessionChats")),
  },
  returns: sessionChatValidator,
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    if (session.archived === true) {
      throw new Error("This session is archived");
    }
    await ensureMainChat(ctx, session);
    const inheritFrom =
      args.fromChatId !== undefined
        ? (await ctx.db.get(args.fromChatId)) ?? undefined
        : undefined;
    return await createSessionChat(ctx, {
      session,
      createdBy: ctx.userId,
      title: args.title,
      inheritFrom,
    });
  },
});

export const rename = authMutation({
  args: { chatId: v.id("sessionChats"), title: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { chat, session } = await getSessionChatOrThrow(ctx.db, args.chatId);
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const title = args.title.trim();
    if (!title) return null;
    await ctx.db.patch(chat._id, { title });
    return null;
  },
});

/**
 * Closes a parallel chat: cancels its turn, kills its daemon and hides its
 * tab. Main cannot be closed — it is the session's own transcript.
 */
export const archive = authMutation({
  args: { chatId: v.id("sessionChats") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const context = await getSessionChatOrThrow(ctx.db, args.chatId);
    const { chat, session } = context;
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    if (chat.isMain) throw new Error("The Main chat cannot be closed");
    if (chat.archived === true) return null;
    await cancelChatExecution(ctx, context);
    await ctx.db.patch(chat._id, { archived: true, updatedAt: Date.now() });
    if (session.sandboxId && session.status === "active") {
      await ctx.scheduler.runAfter(0, internal.sandbox.killEntityDaemon, {
        sandboxId: session.sandboxId,
        repoId: session.repoId,
        entityIdField: "chatId",
        entityId: String(chat._id),
      });
    }
    return null;
  },
});

/**
 * Sets the sticky composer model for a chat. `lastModel` is the single source
 * of truth for the picker, so this is called directly on change (with a
 * client-side optimistic update) rather than only when a message is sent. Does
 * not touch `updatedAt` — changing the model is not conversation activity.
 * Any visible model is allowed, including one from another provider: the
 * sticky account is reconciled to the new model's provider here, and that
 * provider's CLI is caught up on the conversation so far (see
 * `_shared/modelHandoff.ts`).
 */
export const setModel = authMutation({
  args: {
    chatId: v.id("sessionChats"),
    model: aiModelValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { chat, session } = await getSessionChatOrThrow(ctx.db, args.chatId);
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const providerAccountId = await reconcileProviderAccountForModel(
      ctx.db,
      session.createdBy ?? session.userId,
      args.model,
      chat.providerAccountId,
    );
    await ctx.db.patch(chat._id, { lastModel: args.model, providerAccountId });
    return null;
  },
});

/**
 * Sets the sticky provider account for a chat. Same contract as `setModel`:
 * write on change (optimistic on the client), do not bump `updatedAt`. Pass
 * `null` to clear back to Team.
 *
 * Anyone with repo access may pick, but only from accounts owned by the
 * session owner — a session always runs on one person's credentials, and a
 * collaborator must never be able to attach their own.
 */
export const setProviderAccountId = authMutation({
  args: {
    chatId: v.id("sessionChats"),
    providerAccountId: v.union(v.id("userProviderAccounts"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { chat, session } = await getSessionChatOrThrow(ctx.db, args.chatId);
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    const providerAccountId = await assertProviderAccountUsableBy(
      ctx.db,
      args.providerAccountId,
      session.createdBy ?? session.userId,
    );
    await ctx.db.patch(chat._id, { providerAccountId });
    return null;
  },
});

/**
 * Sets sticky composer traits for a chat (effort / thinking / 1M / Fast). Same
 * contract as `setModel`: write on change (optimistic on the client), do not
 * bump `updatedAt`. Only provided fields are patched.
 */
export const setTraits = authMutation({
  args: {
    chatId: v.id("sessionChats"),
    reasoningLevel: v.optional(reasoningLevelValidator),
    thinkingEnabled: v.optional(v.boolean()),
    use1mContext: v.optional(v.boolean()),
    fastMode: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { chat, session } = await getSessionChatOrThrow(ctx.db, args.chatId);
    if (!(await hasRepoAccess(ctx.db, session.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
    if (
      args.reasoningLevel === undefined &&
      args.thinkingEnabled === undefined &&
      args.use1mContext === undefined &&
      args.fastMode === undefined
    ) {
      return null;
    }
    await ctx.db.patch(chat._id, {
      ...(args.reasoningLevel !== undefined
        ? { lastReasoningLevel: args.reasoningLevel }
        : {}),
      ...(args.thinkingEnabled !== undefined
        ? { lastThinkingEnabled: args.thinkingEnabled }
        : {}),
      ...(args.use1mContext !== undefined
        ? { lastUse1mContext: args.use1mContext }
        : {}),
      ...(args.fastMode !== undefined ? { lastFastMode: args.fastMode } : {}),
    });
    return null;
  },
});
