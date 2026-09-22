"use node";

import { ConvexError, v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { encryptValue, decryptValue } from "./encryption";
import {
  normalizeGrokBotWebhookKey,
  parseGrokBotWebhookUrl,
} from "./_grokBot/webhookUrl";
import type { Id } from "./_generated/dataModel";

const CALL_TIMEOUT_MS = 20_000;

async function requireUserId(ctx: ActionCtx): Promise<Id<"users">> {
  const userId = await ctx.runQuery(internal.auth.getUserIdFromIdentity, {});
  if (!userId) {
    throw new Error("Not authenticated");
  }
  return userId;
}

/**
 * Saves an allowlisted Grok Bot webhook. Encrypts the bearer key at rest.
 * Omit `key` to keep the existing key when only the URL changes.
 */
export const setWebhook = action({
  args: {
    url: v.string(),
    key: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const url = parseGrokBotWebhookUrl(args.url);
    if (!url) {
      throw new ConvexError(
        "Webhook URL must be https://api2.cursor.sh/automations/webhook/… from a Grok Bot routine.",
      );
    }

    let encryptedKey: string | undefined;
    if (args.key !== undefined && args.key.trim() !== "") {
      const key = normalizeGrokBotWebhookKey(args.key);
      if (!key) {
        throw new ConvexError(
          "Webhook key looks invalid. Paste the routine key only.",
        );
      }
      encryptedKey = encryptValue(key);
    } else {
      const stored = await ctx.runQuery(internal.grokBot.getStored, { userId });
      if (!stored) {
        throw new ConvexError("Paste the routine key the first time you save.");
      }
    }

    await ctx.runMutation(internal.grokBot.patchSettings, {
      userId,
      url,
      encryptedKey,
    });
    return null;
  },
});

/**
 * POSTs `{ source, task }` to the user's Grok Bot webhook.
 * A 200 means Cursor accepted the run, not that the Bot finished.
 */
export const callWebhook = internalAction({
  args: {
    userId: v.id("users"),
    task: v.string(),
  },
  returns: v.object({
    accepted: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const task = args.task.trim();
    if (task.length === 0) {
      return {
        accepted: false,
        message: "task is empty.",
      };
    }

    const stored = await ctx.runQuery(internal.grokBot.getStored, {
      userId: args.userId,
    });
    if (!stored) {
      return {
        accepted: false,
        message:
          "No Grok Bot webhook is saved. The user must paste the routine URL and key in Eva Settings → Grok Bot.",
      };
    }

    const url = parseGrokBotWebhookUrl(stored.url);
    if (!url) {
      return {
        accepted: false,
        message:
          "The saved webhook URL is not a Grok Bot routine URL. Ask the user to save it again in Settings → Grok Bot.",
      };
    }

    const key = decryptValue(stored.encryptedKey);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ source: "eva", task }),
        redirect: "error",
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });

      if (response.status === 200) {
        return {
          accepted: true,
          message:
            "Grok Bot accepted the call and started a run. That is not a result — do not claim the local work finished.",
        };
      }
      if (response.status === 401) {
        return {
          accepted: false,
          message:
            "Grok Bot rejected the key (401). The user should regenerate the webhook key in Cursor and save it again.",
        };
      }
      return {
        accepted: false,
        message: `Grok Bot webhook returned ${response.status}. A 200 means a run started; this call did not start one.`,
      };
    } catch {
      return {
        accepted: false,
        message:
          "Could not reach Grok Bot. Confirm the routine is Active and try again.",
      };
    }
  },
});
