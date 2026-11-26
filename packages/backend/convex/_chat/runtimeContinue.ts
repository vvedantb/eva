import {
  isTurnMaxRuntimeError,
  TURN_CONTINUE_DISPLAY,
  TURN_CONTINUE_PROMPT,
} from "@eva/shared/agentTurnLimits";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { ComposerTraitFields } from "../_shared/composerTraits";

export type StickyComposerTraits = ComposerTraitFields<
  NonNullable<Doc<"queuedMessages">["reasoningLevel"]>
>;

/**
 * Queues one automatic continue at the front of a chat's queue when its newest
 * turn failed at the runtime cap. The daemon checkpointed the work before it
 * failed, so the agent resumes from git. One continue per user prompt: a
 * continue that also hits the cap stays failed, so a looping agent stops.
 */
export async function queueRuntimeContinue(
  ctx: MutationCtx,
  parentId: Doc<"queuedMessages">["parentId"],
  sticky: StickyComposerTraits,
): Promise<void> {
  const recent = await ctx.db
    .query("messages")
    .withIndex("by_parent", (q) => q.eq("parentId", parentId))
    .order("desc")
    .take(20);
  const replyIndex = recent.findIndex(
    (message) => message.role === "assistant" && message.isSystemAlert !== true,
  );
  const reply = recent[replyIndex];
  if (reply === undefined || !isTurnMaxRuntimeError(reply.content)) return;
  const prompt = recent
    .slice(replyIndex + 1)
    .find((message) => message.role === "user");
  if (prompt?.userId === undefined) return;
  if (prompt.content === TURN_CONTINUE_DISPLAY) return;

  const front = await ctx.db
    .query("queuedMessages")
    .withIndex("by_parent_and_order", (q) => q.eq("parentId", parentId))
    .order("asc")
    .first();
  // A second turn-end drain (background agents settling) must not queue it twice.
  if (front?.content === TURN_CONTINUE_PROMPT) return;

  const now = Date.now();
  await ctx.db.insert("queuedMessages", {
    parentId,
    content: TURN_CONTINUE_PROMPT,
    displayContent: TURN_CONTINUE_DISPLAY,
    createdAt: now,
    order: (front?.order ?? now) - 1,
    userId: prompt.userId,
    model: prompt.model,
    providerAccountId: prompt.credentialAccountId,
    reasoningLevel: prompt.reasoningLevel ?? sticky.lastReasoningLevel,
    thinkingEnabled: sticky.lastThinkingEnabled,
    use1mContext: sticky.lastUse1mContext,
    fastMode: sticky.lastFastMode,
  });
  console.log(`[queue] runtime continue queued parentId=${parentId}`);
}
