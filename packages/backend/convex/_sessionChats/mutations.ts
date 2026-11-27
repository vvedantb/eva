import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, type MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { authMutation, getSessionWithAccess } from "../functions";
import {
  aiModelValidator,
  type ReasoningLevel,
} from "../validators";
import {
  composerTraitFields,
  hasComposerTraitUpdate,
  type ComposerTraits,
} from "../_shared/composerTraits";
import {
  assertProviderAccountUsableBy,
  reconcileProviderAccountForModel,
} from "../_userProviderAccounts/defaults";
import { sessionOwnerProjectId } from "../_sessions/owner";
import {
  ensureMainChat,
  getSessionChatWithAccess,
  moveLegacyTranscriptPage,
  sessionChatValidator,
  type SessionChatContext,
} from "./helpers";
import { sessionAccountHolder } from "../_projects/projectAccount";

/**
 * Continuation of `ensureMainChat`: moves the next bounded page of a heavy
 * pre-chat session transcript onto its chat and reschedules itself until
 * none is left.
 */
export const moveLegacyTranscript = internalMutation({
  args: {
    from: v.id("sessions"),
    chatId: v.id("sessionChats"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const done = await moveLegacyTranscriptPage(ctx, args.from, args.chatId);
    if (!done) {
      await ctx.scheduler.runAfter(
        0,
        internal._sessionChats.mutations.moveLegacyTranscript,
        args,
      );
    }
    return null;
  },
});

/**
 * Page-open hook: gives a session predating chats its Main chat (and moves
 * its transcript onto it). Idempotent and cheap once the chat exists.
 */
export const ensureMain = authMutation({
  args: { sessionId: v.id("sessions") },
  returns: sessionChatValidator,
  handler: async (ctx, args) => {
    const session = await getSessionWithAccess(
      ctx.db,
      args.sessionId,
      ctx.userId,
    );
    return await ensureMainChat(ctx, session);
  },
});

/**
 * The model write behind the picker (`chats.setModel`). `lastModel` is the
 * single source of truth for the picker, so the pick is written on change
 * (with a client-side optimistic update), not only when a message is sent.
 * Does not touch `updatedAt`: changing the model is not conversation
 * activity. Any visible model is allowed, including one from another
 * provider: the sticky account is reconciled to the new model's provider
 * here, and that provider's CLI is caught up on the conversation so far (see
 * `_shared/modelHandoff.ts`). The caller checks access.
 */
export async function setSessionChatModel(
  ctx: MutationCtx,
  { chat, session }: SessionChatContext,
  model: Infer<typeof aiModelValidator>,
): Promise<void> {
  const providerAccountId = await reconcileProviderAccountForModel(
    ctx.db,
    await sessionAccountHolder(ctx.db, session, chat.providerAccountId),
    model,
    chat.providerAccountId,
  );
  await ctx.db.patch(chat._id, { lastModel: model, providerAccountId });
  await onChatAccountChanged(ctx, { chat, session }, providerAccountId);
}

/**
 * Eva's chat holds her project's account: a new one there lifts a task's
 * usage-limit hold, so the project's scheduler goes on.
 */
async function onChatAccountChanged(
  ctx: MutationCtx,
  { chat, session }: SessionChatContext,
  providerAccountId: Id<"userProviderAccounts"> | undefined,
): Promise<void> {
  const projectId = sessionOwnerProjectId(session);
  if (projectId === undefined) return;
  if (providerAccountId === chat.providerAccountId) return;
  await ctx.scheduler.runAfter(0, internal.buildWorkflow.scheduleReadyTasks, {
    projectId,
  });
}

/**
 * Sets the sticky provider account for a chat. Same contract as `setSessionChatModel`:
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
    const context = await getSessionChatWithAccess(
      ctx.db,
      args.chatId,
      ctx.userId,
    );
    const { chat, session } = context;
    const providerAccountId = await assertProviderAccountUsableBy(
      ctx.db,
      args.providerAccountId,
      await sessionAccountHolder(
        ctx.db,
        session,
        args.providerAccountId ?? undefined,
      ),
    );
    await ctx.db.patch(chat._id, { providerAccountId });
    await onChatAccountChanged(ctx, context, providerAccountId);
    return null;
  },
});

/**
 * The traits write behind the picker (`chats.setModel`): effort / thinking /
 * 1M / Fast. Same contract as `setSessionChatModel`: written on change, no
 * `updatedAt` bump. Only the given traits are patched. The caller checks
 * access.
 */
export async function setSessionChatTraits(
  ctx: MutationCtx,
  chatId: Id<"sessionChats">,
  traits: ComposerTraits<ReasoningLevel>,
): Promise<void> {
  if (!hasComposerTraitUpdate(traits)) return;
  await ctx.db.patch(chatId, composerTraitFields(traits));
}
