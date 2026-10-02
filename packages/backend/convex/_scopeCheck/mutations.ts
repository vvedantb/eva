/**
 * Writing the scope verdict back, and the one place a turn asks for one.
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { scopeCheckValidator } from "../_validators/shapes";
import { resolveChatOwner } from "./queries";

/**
 * Stores the verdict, then publishes it to the chat's PR when there is one and
 * something was flagged. A message deleted mid-flight is not an error.
 *
 * Publishing from here rather than from the PR flow means the section lands as
 * soon as a verdict exists, however long after the push that is — the check is
 * background work that retries for up to 90 seconds waiting for GitHub.
 */
export const setScopeCheck = internalMutation({
  args: { messageId: v.id("messages"), scopeCheck: scopeCheckValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) return null;
    await ctx.db.patch(args.messageId, { scopeCheck: args.scopeCheck });

    if (args.scopeCheck.flagged.length === 0) return null;
    const { repoId, prUrl } = await resolveChatOwner(ctx, message.parentId);
    if (repoId === null || prUrl === null) return null;
    await ctx.scheduler.runAfter(0, internal.github.publishScopeSection, {
      repoId,
      prUrl,
    });
    return null;
  },
});

/**
 * Queues the check for a turn that changed code.
 *
 * Scheduled rather than inline: the judging is several GitHub and Jev
 * round-trips, and the user is waiting on the reply. Everything downstream
 * fails open, so a turn whose check never runs simply has no `scopeCheck`.
 */
export async function scheduleScopeCheck(
  ctx: MutationCtx,
  message: { _id: Id<"messages">; beforeSha?: string; afterSha?: string },
): Promise<void> {
  const { beforeSha, afterSha } = message;
  if (beforeSha === undefined || afterSha === undefined) return;
  // Equal shas mean the turn changed no code.
  if (beforeSha === afterSha) return;
  await ctx.scheduler.runAfter(0, internal.scopeCheck.evaluateTurn, {
    messageId: message._id,
    attempt: 1,
  });
}
