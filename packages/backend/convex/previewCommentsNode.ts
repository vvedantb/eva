"use node";

import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import {
  annotationRef,
  buildAnnotationPrompt,
  parseAnnotationContext,
} from "@eva/shared/previewAnnotationContext";
import { verifyPreviewCommentsToken } from "./previewGrant";

/**
 * Runs one preview-comments request from a direct sandbox link. The HTTP route
 * (`previewCommentsHttp.ts`) passes the bearer token and JSON body here; this
 * checks the token and acts as the user and chat it names. The page can ask for
 * nothing else: the chat comes from the token, never from the body.
 */

const sendBody = z.object({
  feedback: z.string().max(4_000),
  context: z.object({}).loose(),
});
const resolveBody = z.object({ id: z.string(), resolved: z.boolean() });

interface HandleResult {
  status: number;
  json: string;
}

export const handle = internalAction({
  args: {
    op: v.union(v.literal("list"), v.literal("send"), v.literal("resolve")),
    token: v.string(),
    body: v.string(),
  },
  returns: v.object({ status: v.number(), json: v.string() }),
  handler: async (ctx, args): Promise<HandleResult> => {
    const fail = (status: number, message: string): HandleResult => ({
      status,
      json: JSON.stringify({ error: message }),
    });
    const claims = await verifyPreviewCommentsToken(args.token);
    if (!claims) return fail(401, "This preview link has expired. Reload it.");
    const userId = claims.userId as Id<"users">;
    const chatId = claims.chatId as Id<"sessionChats">;
    try {
      if (args.op === "list") {
        // Typed `unknown` on purpose: the api type that would name it
        // includes this action, which would make its own type circular.
        const comments: unknown = await ctx.runQuery(
          internal.previewComments.listForUser,
          { userId, chatId },
        );
        return { status: 200, json: JSON.stringify({ comments }) };
      }
      const raw: unknown = JSON.parse(args.body || "{}");
      if (args.op === "send") {
        const body = sendBody.parse(raw);
        // The same context object the Eva page gets from the injected script,
        // read and turned into a prompt by the same shared code.
        const context = parseAnnotationContext(body.context);
        if (!context) return fail(400, "Invalid request");
        await ctx.runMutation(internal.previewComments.sendForUser, {
          userId,
          chatId,
          feedback: body.feedback,
          prompt: buildAnnotationPrompt(body.feedback, context),
          ref: annotationRef(context),
        });
        return { status: 200, json: JSON.stringify({ ok: true }) };
      }
      const body = resolveBody.parse(raw);
      await ctx.runMutation(internal.previewComments.setResolvedForUser, {
        userId,
        id: body.id as Id<"messages">,
        resolved: body.resolved,
      });
      return { status: 200, json: JSON.stringify({ ok: true }) };
    } catch (error) {
      if (error instanceof z.ZodError) return fail(400, "Invalid request");
      // A Convex error message carries a stack; the page shows the first line.
      const message =
        error instanceof Error
          ? (error.message.split("\n")[0] ?? "").replace(/^Uncaught Error: /, "")
          : "";
      return fail(400, message || "Request failed");
    }
  },
});
