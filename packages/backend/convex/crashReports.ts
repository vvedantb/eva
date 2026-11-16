import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { getCurrentUserId } from "./_auth/currentUser";

/** Longest stack kept: Android Java stacks run to a few KB. */
const MAX_STACK = 6_000;

/**
 * The phone app reports the error that closed it, once, on the next launch
 * (`apps/mobile/src/logging/useReportLastCrash.ts`). There is no table: the
 * report is one `[phone-crash]` log line, which Convex's log stream sends to
 * Axiom (dataset `eva`, `data.message`). Only signed-in users report, so the
 * endpoint is not an open log sink. The report holds the error and its stack,
 * never chat content.
 */
export const report = mutation({
  args: {
    at: v.number(),
    version: v.string(),
    platform: v.string(),
    name: v.string(),
    message: v.string(),
    stack: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) return null;
    const line = {
      userId,
      at: new Date(args.at).toISOString(),
      version: args.version.slice(0, 40),
      platform: args.platform.slice(0, 20),
      name: args.name.slice(0, 200),
      message: args.message.slice(0, 500),
      stack: args.stack.slice(0, MAX_STACK),
    };
    console.error(`[phone-crash] ${JSON.stringify(line)}`);
    return null;
  },
});
