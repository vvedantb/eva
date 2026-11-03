/**
 * The `submit_feedback` MCP tool: the agent records how a turn landed with
 * the user — clear frustration or clear praise — so it shows on the global
 * Feedback page and as a card under the current reply. Storage is injected as
 * `run`, which keeps the Convex types out of this module (see `renderHtmlTool`).
 */

import { toolErrorResult, toolJsonResult } from "@vvedantb/server";
import { z } from "zod";
import { defineTool, type EvaTool } from "../mcp/registry";

/** Kept short on purpose: one line the team can skim on the Feedback page. */
export const SUBMIT_FEEDBACK_SUMMARY_MAX = 500;

export const submitFeedbackInputShape = {
  sentiment: z
    .enum(["positive", "negative"])
    .describe(
      '"negative": the user is frustrated or something went wrong. "positive": the user says something went well.',
    ),
  summary: z
    .string()
    .min(1)
    .max(SUBMIT_FEEDBACK_SUMMARY_MAX)
    .describe(
      "One or two plain sentences: what happened and what the user said about it. No secrets, tokens or personal data.",
    ),
};

export type SubmitFeedbackInput = z.infer<
  z.ZodObject<typeof submitFeedbackInputShape>
>;

export const SUBMIT_FEEDBACK_DESCRIPTION = `Record feedback about Eva from this chat. It shows on Eva's Feedback page and as a card under your current reply, where the user can delete it.

Call it when the user clearly shows frustration (repeated failures, "this is broken", "you keep doing X") or clearly says something went well, or when the user asks you to send feedback. Once per issue: do not call it again for the same problem in this chat. Do not call it for neutral messages or your own mistakes the user has not commented on. After you call it, tell the user in one short line that you sent feedback. Requires a session, quick task or project sandbox.`;

/** Builds the tool over an injected store call. `tools.ts` passes the Convex path; tests pass a fake. */
export function submitFeedbackTool(
  run: (input: SubmitFeedbackInput) => Promise<string | null>,
): EvaTool {
  return defineTool({
    name: "submit_feedback",
    description: SUBMIT_FEEDBACK_DESCRIPTION,
    mutating: true,
    input: submitFeedbackInputShape,
    handler: async (input) => {
      const feedbackId = await run(input);
      if (feedbackId === null) {
        return toolErrorResult(
          "submit_feedback could not store the feedback: this sandbox is not attached to a chat any more.",
        );
      }
      return toolJsonResult({
        feedbackId,
        status: "submitted",
        message:
          "Shown to the user under your reply. Tell them in one short line that you sent feedback.",
      });
    },
  });
}
