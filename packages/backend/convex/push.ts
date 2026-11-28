import { v } from "convex/values";
import {
  createExpoPushFunctions,
  type ExpoPushCheckReceiptsRef,
  type ExpoPushListTokensRef,
  type ExpoPushRemoveTokensRef,
  type ExpoPushSendRef,
  type PushSendParams,
} from "@vvedantb/server";
import { resolveNotificationPrefs } from "@eva/shared/notificationRouting";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  type MutationCtx,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import { getCurrentUserId } from "./_auth/currentUser";

const expoPush = createExpoPushFunctions({
  v,
  userId: v.id("users"),
  mutation,
  internalQuery,
  internalMutation,
  internalAction,
  requireCurrentUserId: async (ctx: MutationCtx) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    return userId;
  },
  listTokensRef: (): ExpoPushListTokensRef<Id<"users">> => internal.push.listTokensForUser,
  removeTokensRef: (): ExpoPushRemoveTokensRef => internal.push.removeTokens,
  sendRef: (): ExpoPushSendRef<Id<"users">> => internal.push.send,
  checkReceiptsRef: (): ExpoPushCheckReceiptsRef => internal.push.checkReceipts,
});

export const { register, unregister, listTokensForUser, removeTokens, send, checkReceipts } = expoPush;

/** Queues a push to every device of `params.userId`, unless they turned push off. */
export async function schedulePush(ctx: MutationCtx, params: PushSendParams<Id<"users">>): Promise<void> {
  const user = await ctx.db.get(params.userId);
  if (!resolveNotificationPrefs(user?.notificationPrefs).push) return;
  await expoPush.schedulePush(ctx, params);
}
