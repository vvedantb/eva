import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { ChatSettingsSource } from "../_sessionChats/helpers";
import { findMainChat } from "../_sessionChats/helpers";
import { findWorkChat } from "../_sessions/ownerState";

/**
 * One model per chat: the model, traits and account a task, project or
 * session stored beside its chat move onto that chat, then the old fields are
 * cleared. A chat that already has a model keeps all its picks: the stored
 * copy is older than anything picked in the chat. An owner with no chat yet
 * loses nothing that matters: its chat starts on Eva's or the repo's picks
 * (`chatSeedSettings`).
 */

/** The chat fields a stored copy fills, or null when the chat keeps its own. */
export function chatPicksToFill(
  stored: ChatSettingsSource,
  chat: ChatSettingsSource,
): ChatSettingsSource | null {
  if (chat.lastModel !== undefined || stored.lastModel === undefined) {
    return null;
  }
  return stored;
}

async function fill(
  ctx: MutationCtx,
  chat: Doc<"sessionChats"> | null,
  stored: ChatSettingsSource,
): Promise<void> {
  if (!chat) return;
  const patch = chatPicksToFill(stored, chat);
  if (patch) await ctx.db.patch(chat._id, patch);
}

export async function moveTaskModelToChat(
  ctx: MutationCtx,
  task: Doc<"agentTasks">,
): Promise<void> {
  if (
    task.model === undefined &&
    task.providerAccountId === undefined &&
    task.reasoningLevel === undefined &&
    task.thinkingEnabled === undefined &&
    task.use1mContext === undefined &&
    task.fastMode === undefined
  ) {
    return;
  }
  const owned = await findWorkChat(ctx.db, { kind: "task", task });
  await fill(ctx, owned?.chat ?? null, {
    lastModel: task.model,
    providerAccountId: task.providerAccountId,
    lastReasoningLevel: task.reasoningLevel,
    lastThinkingEnabled: task.thinkingEnabled,
    lastUse1mContext: task.use1mContext,
    lastFastMode: task.fastMode,
  });
  await ctx.db.patch(task._id, {
    model: undefined,
    providerAccountId: undefined,
    reasoningLevel: undefined,
    thinkingEnabled: undefined,
    use1mContext: undefined,
    fastMode: undefined,
  });
}

export async function moveProjectModelToChat(
  ctx: MutationCtx,
  project: Doc<"projects">,
): Promise<void> {
  if (project.model === undefined && project.providerAccountId === undefined) {
    return;
  }
  const owned = await findWorkChat(ctx.db, { kind: "project", project });
  await fill(ctx, owned?.chat ?? null, {
    lastModel: project.model,
    providerAccountId: project.providerAccountId,
  });
  await ctx.db.patch(project._id, {
    model: undefined,
    providerAccountId: undefined,
  });
}

export async function moveSessionModelToChat(
  ctx: MutationCtx,
  session: Doc<"sessions">,
): Promise<void> {
  const stored: ChatSettingsSource = {
    provider: session.provider,
    providerAccountId: session.providerAccountId,
    lastModel: session.lastModel,
    lastReasoningLevel: session.lastReasoningLevel,
    lastThinkingEnabled: session.lastThinkingEnabled,
    lastUse1mContext: session.lastUse1mContext,
    lastFastMode: session.lastFastMode,
  };
  if (Object.values(stored).every((value) => value === undefined)) return;
  await fill(ctx, await findMainChat(ctx.db, session._id), stored);
  await ctx.db.patch(session._id, {
    provider: undefined,
    providerAccountId: undefined,
    lastModel: undefined,
    lastReasoningLevel: undefined,
    lastThinkingEnabled: undefined,
    lastUse1mContext: undefined,
    lastFastMode: undefined,
  });
}
