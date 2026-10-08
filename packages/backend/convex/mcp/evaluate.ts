"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { evaluateDecision } from "../_jev/client";
import type { EvaluateOutcome } from "../_jev/schema";

const probabilities = v.optional(v.record(v.string(), v.number()));

const answerValidator = v.union(
  v.object({ type: v.literal("boolean"), probability: v.number() }),
  v.object({ type: v.literal("choice"), choice: v.string(), probabilities }),
  v.object({ type: v.literal("score"), score: v.number(), probabilities }),
);

const tokenCount = v.union(v.number(), v.null());

/**
 * Asks TypeSafe Jev (via Vercel AI Gateway) the caller's typed questions about
 * one piece of state. The MCP `evaluate` tool is the only caller; it has
 * already parsed the input, but `evaluateDecision` re-parses so a direct
 * action call is held to the same caps. Errors come back as data, matching
 * `runPostgresQuery`.
 */
export const runEvaluate = internalAction({
  args: {
    state: v.any(),
    questions: v.any(),
  },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      model: v.string(),
      answers: v.record(v.string(), answerValidator),
      usage: v.object({
        inputTokens: tokenCount,
        outputTokens: tokenCount,
        totalTokens: tokenCount,
      }),
      warnings: v.array(v.string()),
      metadata: v.any(),
    }),
    v.object({
      ok: v.literal(false),
      errorCode: v.union(
        v.literal("missing_config"),
        v.literal("invalid_request"),
        v.literal("provider_error"),
      ),
      error: v.string(),
      retryable: v.boolean(),
    }),
  ),
  handler: async (_ctx, args): Promise<EvaluateOutcome> =>
    evaluateDecision(args, { tag: "eva-mcp-evaluate" }),
});
