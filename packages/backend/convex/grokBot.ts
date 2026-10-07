import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { authMutation, authQuery } from "./functions";

const storedWebhookValidator = v.union(
  v.object({
    url: v.string(),
    encryptedKey: v.string(),
  }),
  v.null(),
);

/** URL plus whether a key is stored. Never returns the key. */
export const getSettings = authQuery({
  args: {},
  returns: v.object({
    url: v.union(v.string(), v.null()),
    hasKey: v.boolean(),
  }),
  handler: async (ctx) => {
    const user = await ctx.db.get(ctx.userId);
    return {
      url: user?.grokBotWebhookUrl ?? null,
      hasKey: Boolean(user?.grokBotWebhookKey),
    };
  },
});

/** Drops the saved webhook URL and key for the signed-in user. */
export const clearSettings = authMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.db.patch(ctx.userId, {
      grokBotWebhookUrl: undefined,
      grokBotWebhookKey: undefined,
    });
    return null;
  },
});

export const getStored = internalQuery({
  args: { userId: v.id("users") },
  returns: storedWebhookValidator,
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user?.grokBotWebhookUrl || !user.grokBotWebhookKey) {
      return null;
    }
    return {
      url: user.grokBotWebhookUrl,
      encryptedKey: user.grokBotWebhookKey,
    };
  },
});

export const patchSettings = internalMutation({
  args: {
    userId: v.id("users"),
    url: v.string(),
    encryptedKey: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      grokBotWebhookUrl: args.url,
      ...(args.encryptedKey !== undefined
        ? { grokBotWebhookKey: args.encryptedKey }
        : {}),
    });
    return null;
  },
});
