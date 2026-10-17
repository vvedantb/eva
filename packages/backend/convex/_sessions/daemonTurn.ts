import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { AIModel, ModelTraitsExecutionArgs } from "../validators";
import { sessionChatPersistenceId } from "../_sessionChats/helpers";
import { SESSION_TOOLS } from "./workflow";

/** The `pendingTurn` a chat's warm daemon claims through claimPendingTurn. */
export function buildDaemonPendingTurn(turn: {
  prompt: string;
  turnId: Id<"turns">;
  model: AIModel;
  attachmentStorageIds?: Id<"_storage">[];
}): NonNullable<Doc<"sessionChats">["pendingTurn"]> {
  return {
    prompt: turn.prompt,
    requestedAt: Date.now(),
    turnId: turn.turnId,
    attachmentStorageIds: turn.attachmentStorageIds,
    model: turn.model,
    interactionMode: "default",
  };
}

/**
 * Boots the chat's daemon now, so it is warm when its staged turn becomes
 * claimable, instead of after the workflow's validate and bookkeeping steps
 * (~7s on a new session). Pass the same traits the workflow forwards to its own
 * prewarm: a different opts signature kills this daemon. No-op until the
 * session has a sandbox.
 */
export async function scheduleChatDaemonPrewarm(
  ctx: MutationCtx,
  params: {
    session: Doc<"sessions">;
    chat: Doc<"sessionChats">;
    userId: Id<"users">;
    model: AIModel;
    launchTraits: ModelTraitsExecutionArgs;
    providerAccountId?: Id<"userProviderAccounts">;
  },
): Promise<void> {
  const { session, chat } = params;
  if (!session.sandboxId) return;
  await ctx.scheduler.runAfter(0, internal.sandbox.prewarmSessionDaemon, {
    sandboxId: session.sandboxId,
    chatId: chat._id,
    repoId: session.repoId,
    userId: params.userId,
    model: params.model,
    ...params.launchTraits,
    allowedTools: SESSION_TOOLS,
    providerAccountId: params.providerAccountId,
    credentialOwnerUserId: session.createdBy ?? session.userId,
    sessionPersistenceId: sessionChatPersistenceId(chat),
  });
}
