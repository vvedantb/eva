/**
 * Writing the scope verdict back, and the one place a turn asks for one.
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { scopeCheckValidator } from "../_validators/shapes";

/** Stores the verdict. A message deleted mid-flight is not an error. */
export const setScopeCheck = internalMutation({
  args: { messageId: v.id("messages"), scopeCheck: scopeCheckValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) return null;
    await ctx.db.patch(args.messageId, { scopeCheck: args.scopeCheck });
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
