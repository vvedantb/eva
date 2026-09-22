"use node";

import { v } from "convex/values";
import { marked } from "marked";
import { z } from "zod";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { sendEmail } from "../email";
import { buildAgentEmailHtml } from "../emailTemplates";
import {
  sendEmailInputShape,
  type SendEmailOutcome,
} from "../_mcp/sendEmailTool";

const sendEmailInput = z.object(sendEmailInputShape);

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/**
 * Sends one email to the calling MCP user. The recipient comes from the user
 * id on the token, never from the arguments, so an agent cannot mail anyone
 * else. The tool layer has already parsed the input; this re-parses so a direct
 * action call is held to the same caps. Errors come back as data, like
 * `runEvaluate`.
 */
export const runSendEmail = internalAction({
  args: { userId: v.string(), subject: v.string(), body: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true), to: v.string() }),
    v.object({
      ok: v.literal(false),
      errorCode: v.union(
        v.literal("no_email"),
        v.literal("invalid_request"),
        v.literal("provider_error"),
      ),
      error: v.string(),
    }),
  ),
  handler: async (ctx, args): Promise<SendEmailOutcome> => {
    const parsed = sendEmailInput.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        errorCode: "invalid_request",
        error: describeIssues(parsed.error),
      };
    }
    const { subject, body } = parsed.data;

    const recipient = await ctx.runQuery(internal.users.getEmailRecipientById, {
      userId: args.userId,
    });
    if (!recipient) {
      return {
        ok: false,
        errorCode: "no_email",
        error: "No email address on the calling user's Eva account.",
      };
    }

    const appUrl = process.env.WEB_APP_URL;
    if (!appUrl) {
      return {
        ok: false,
        errorCode: "provider_error",
        error: "WEB_APP_URL is not set on this Convex deployment.",
      };
    }

    const contentHtml = await marked.parse(body);
    const html = buildAgentEmailHtml({
      recipientName: recipient.name,
      appUrl,
      subject,
      contentHtml,
    });

    try {
      await sendEmail({ to: recipient.email, subject, html });
      // Outside production sendEmail redirects to the test inbox; `to` is still
      // the user's own address, which is what the agent asked for.
      return { ok: true, to: recipient.email };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Never log the body — it is the user's content.
      console.error("[mcp.sendEmail]", message);
      return { ok: false, errorCode: "provider_error", error: message };
    }
  },
});
