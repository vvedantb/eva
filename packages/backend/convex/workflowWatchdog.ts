import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  sessionChatAdapter,
  trackSessionChatWorkflow,
} from "./_chat/surfaceAdapters";
import { finalizeStaleChatTurn } from "./_chat/stallWatchdog";

export { trackSessionChatWorkflow };

/** Cancels a stale session chat workflow and starts the next queued message. */
export const handleStaleSessionChat = internalMutation({
  args: {
    chatId: v.id("sessionChats"),
    workflowId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const context = await sessionChatAdapter.getEntity(ctx, args.chatId);
    if (
      !context ||
      (await sessionChatAdapter.activeWorkflowId(context, ctx)) !==
        args.workflowId
    ) {
      return null;
    }
    await finalizeStaleChatTurn(
      ctx,
      sessionChatAdapter,
      args.chatId,
      context,
      args.workflowId,
      sessionChatAdapter.alerts.timeout,
    );
    return null;
  },
});
