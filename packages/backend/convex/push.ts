import { v } from "convex/values";
import {
  createExpoPushFunctions,
  type ExpoPushCheckReceiptsRef,
  type ExpoPushListTokensRef,
  type ExpoPushRemoveTokensRef,
  type ExpoPushSendRef,
} from "@vvedantb/server";
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

/**
 * Phone push for the Eva mobile app (apps/mobile), sent through the Expo Push
 * API by `@vvedantb/server`. Only two events push: an agent asking a blocking
 * question, and the notification types in `PUSH_NOTIFICATION_TYPES` (see
 * notifications.ts). Pass the chat id the mobile route opens as
 * `data: { target }`. The `pushTokens` table is defined in schema.ts.
 */
export const { register, unregister, listTokensForUser, removeTokens, send, checkReceipts, schedulePush } =
  createExpoPushFunctions({
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
    // Keep the return annotations: without them `internal` refers to itself (TS7022).
    listTokensRef: (): ExpoPushListTokensRef<Id<"users">> => internal.push.listTokensForUser,
    removeTokensRef: (): ExpoPushRemoveTokensRef => internal.push.removeTokens,
    sendRef: (): ExpoPushSendRef<Id<"users">> => internal.push.send,
    checkReceiptsRef: (): ExpoPushCheckReceiptsRef => internal.push.checkReceipts,
  });
