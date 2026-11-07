import { v } from "convex/values";
import { z } from "zod";
import {
  type MutationCtx,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { authMutation } from "./functions";

/**
 * Phone push for the Eva mobile app (apps/mobile), sent through the Expo Push
 * API. Only two events push: an agent asking a blocking question, and the
 * notification types in `PUSH_NOTIFICATION_TYPES` (see notifications.ts).
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Expo push tokens look like `ExponentPushToken[...]` or `ExpoPushToken[...]`. */
const EXPO_TOKEN_PATTERN = /^Expo(nent)?PushToken\[.+\]$/;

/** Saves this device's push token for the signed-in user (idempotent). */
export const register = authMutation({
  args: { token: v.string(), platform: v.union(v.literal("android"), v.literal("ios")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!EXPO_TOKEN_PATTERN.test(args.token)) throw new Error("Invalid push token");
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    const fields = { userId: ctx.userId, platform: args.platform, updatedAt: Date.now() };
    if (existing) {
      // A token moves with the device, so a new sign-in takes it over.
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("pushTokens", { token: args.token, ...fields });
    }
    return null;
  },
});

/** Drops this device's token, on sign-out or when the user turns push off. */
export const unregister = authMutation({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (existing && existing.userId === ctx.userId) await ctx.db.delete(existing._id);
    return null;
  },
});

/**
 * Queues a push to every device of `userId`. `target` is the id the mobile
 * chat route opens (a session chat, session, quick task or project id).
 */
export async function schedulePush(
  ctx: MutationCtx,
  params: { userId: Id<"users">; title: string; body?: string; target?: string },
): Promise<void> {
  const hasToken = await ctx.db
    .query("pushTokens")
    .withIndex("by_user", (q) => q.eq("userId", params.userId))
    .first();
  // Most users have no phone registered; skip the action entirely for them.
  if (!hasToken) return;
  await ctx.scheduler.runAfter(0, internal.push.send, params);
}

export const listTokensForUser = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    return rows.map((row) => row.token);
  },
});

export const removeTokens = internalMutation({
  args: { tokens: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const token of args.tokens) {
      const row = await ctx.db
        .query("pushTokens")
        .withIndex("by_token", (q) => q.eq("token", token))
        .first();
      if (row) await ctx.db.delete(row._id);
    }
    return null;
  },
});

const expoTicketsSchema = z.object({
  data: z.array(
    z.object({
      status: z.enum(["ok", "error"]),
      details: z.object({ error: z.string().optional() }).optional(),
    }),
  ),
});

export const send = internalAction({
  args: {
    userId: v.id("users"),
    title: v.string(),
    body: v.optional(v.string()),
    target: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const tokens = await ctx.runQuery(internal.push.listTokensForUser, {
      userId: args.userId,
    });
    if (tokens.length === 0) return null;
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(
        tokens.map((to) => ({
          to,
          title: args.title,
          body: args.body,
          sound: "default",
          priority: "high",
          data: args.target ? { target: args.target } : {},
        })),
      ),
    });
    if (!response.ok) {
      console.error(`Expo push failed: ${response.status} ${await response.text()}`);
      return null;
    }
    const parsed = expoTicketsSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    // Tickets come back in request order. An uninstalled app reports
    // DeviceNotRegistered; drop those tokens so we stop sending to them.
    const dead = tokens.filter(
      (_, index) => parsed.data.data[index]?.details?.error === "DeviceNotRegistered",
    );
    if (dead.length > 0) await ctx.runMutation(internal.push.removeTokens, { tokens: dead });
    return null;
  },
});
