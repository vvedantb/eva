/**
 * The `send_email` MCP tool: an agent mailing the user who owns the connection.
 *
 * The input schema, its caps, the description and the result shape live here,
 * runtime-free, so the V8 tool layer (`mcp/tools.ts`) and the `"use node"`
 * action (`mcp/sendEmail.ts`) share one contract. The send itself is injected
 * as `run`, which keeps SendGrid and markdown inside the node module.
 */

import { z } from "zod";
import { defineTool, type EvaTool } from "../mcp/registry";
import { errorResult, textResult } from "../mcp/toolShared";

export const MAX_SUBJECT_CHARS = 200;
export const MAX_BODY_CHARS = 50_000;

/** Raw shape for `defineTool`; there is no recipient field by design. */
export const sendEmailInputShape = {
  subject: z
    .string()
    .trim()
    .min(1)
    .max(MAX_SUBJECT_CHARS)
    .describe("Email subject line."),
  body: z
    .string()
    .trim()
    .min(1)
    .max(MAX_BODY_CHARS)
    .describe(
      "Email body as markdown (headings, lists, links and code are rendered).",
    ),
} satisfies z.ZodRawShape;

export type SendEmailErrorCode =
  | "no_email"
  | "invalid_request"
  | "provider_error";

/** The node action's return, mirrored by its Convex `returns` validator. */
export type SendEmailOutcome =
  | { ok: true; to: string }
  | { ok: false; errorCode: SendEmailErrorCode; error: string };

/** Agent-facing message for a failed outcome; never echoes the body. */
export function sendEmailErrorMessage(
  outcome: Extract<SendEmailOutcome, { ok: false }>,
): string {
  switch (outcome.errorCode) {
    case "no_email":
      return "send_email could not find an email address on your Eva account. Sign in to Eva so your profile has one, then try again.";
    case "invalid_request":
      return `send_email rejected the request: ${outcome.error}`;
    case "provider_error":
      return `send_email failed: ${outcome.error}`;
  }
}

export const SEND_EMAIL_DESCRIPTION = `Email the user who owns this MCP connection. The recipient is always the account the token belongs to — there is no recipient argument and it cannot email anyone else. Use it to hand over a finished result, a summary, or something the user asked to receive by mail. Takes a subject and a markdown body; the body is rendered to HTML in Eva's email template. Sent from Eva's SendGrid sender. Outside production the mail is redirected to Eva's test inbox. Do not include secrets in the body.`;

/**
 * Builds the tool over an injected send. `tools.ts` passes the Convex action
 * (which resolves the recipient from the caller's identity); tests pass a fake.
 */
export function sendEmailTool(
  run: (input: { subject: string; body: string }) => Promise<SendEmailOutcome>,
): EvaTool {
  return defineTool({
    name: "send_email",
    description: SEND_EMAIL_DESCRIPTION,
    mutating: true,
    input: sendEmailInputShape,
    handler: async ({ subject, body }) => {
      const outcome = await run({ subject, body });
      if (!outcome.ok) return errorResult(sendEmailErrorMessage(outcome));
      return textResult({ status: "sent", to: outcome.to, subject });
    },
  });
}
