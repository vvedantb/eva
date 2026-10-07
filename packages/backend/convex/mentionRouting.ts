"use node";

/**
 * Decides how loudly each chat `@`-mention is delivered.
 *
 * `notifyChatMentions` has already written the inbox rows and deliberately
 * skipped the instant email every other high-signal notification schedules;
 * this action asks Jev why each person was named and records the answer, which
 * is what picks instant email / daily digest / inbox only.
 *
 * Failure is not fatal and never silent: a mention that cannot be judged falls
 * back to the pre-routing behaviour (the 15-minute debounced email) with its
 * urgency left unset, so the worst case is today's behaviour.
 *
 * Its own top-level module because `"use node"` cannot be mixed into the
 * isolate bundle `_mentions/*` is part of.
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { readChoice } from "./_jev/answers";
import { evaluateDecision } from "./_jev/client";
import {
  MENTION_ROUTE_CRITERIA,
  urgencyFromRouting,
} from "./_mentions/routingUrgency";

/** Gateway usage tag, so the spend is attributable to this feature. */
const ROUTING_TAG = "eva-mention-routing";

export const routeMentions = internalAction({
  args: {
    items: v.array(
      v.object({
        notificationId: v.id("notifications"),
        userId: v.id("users"),
        mentionedName: v.string(),
      }),
    ),
    message: v.string(),
    authorName: v.string(),
    surface: v.string(),
    entityTitle: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Sequential: a message mentions one to three people in practice, and the
    // per-item fallback below means one slow judgement cannot lose another.
    for (const item of args.items) {
      const outcome = await evaluateDecision(
        {
          state: {
            author: args.authorName,
            mentioned: item.mentionedName,
            surface: args.surface,
            entityTitle: args.entityTitle,
            message: args.message,
          },
          questions: {
            routing: {
              type: "choice",
              instructions: `Why is ${item.mentionedName} mentioned in this message?`,
              criteria: MENTION_ROUTE_CRITERIA(item.mentionedName),
            },
          },
        },
        { tag: ROUTING_TAG },
      );

      const routing = readChoice(outcome, "routing");
      if (!routing) {
        console.error(
          "[mentionRouting.routeMentions] routing unavailable",
          outcome.ok ? "no choice answer" : outcome.errorCode,
          outcome.ok ? "" : outcome.error,
        );
        await ctx.runMutation(
          internal.notifications.scheduleLegacyMentionEmail,
          { userId: item.userId },
        );
        continue;
      }

      await ctx.runMutation(internal.notifications.setUrgency, {
        notificationId: item.notificationId,
        urgency: urgencyFromRouting(routing.choice),
      });
    }
    return null;
  },
});
