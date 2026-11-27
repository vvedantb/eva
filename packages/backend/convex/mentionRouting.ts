"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { readChoice } from "./_jev/answers";
import { evaluateDecision } from "./_jev/client";
import {
  MENTION_ROUTE_CRITERIA,
  urgencyFromRouting,
} from "./_mentions/routingUrgency";

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
          internal.notifications.routeMentionFallback,
          { notificationId: item.notificationId },
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
