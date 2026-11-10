"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { evaluateDecision } from "../_jev/client";
import { loadImages } from "../_jev/images";
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
 *
 * An image that cannot be judged fails the call rather than being skipped:
 * the agent's questions name it, and Jev answering about a picture it never
 * saw would look like a real answer.
 */
export const runEvaluate = internalAction({
  args: {
    state: v.any(),
    questions: v.any(),
    images: v.optional(
      v.array(v.object({ name: v.string(), storageId: v.string() })),
    ),
    longContext: v.optional(v.boolean()),
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
  handler: async (ctx, args): Promise<EvaluateOutcome> => {
    const refs = args.images ?? [];
    if (refs.length === 0) {
      return evaluateDecision(args, { tag: "eva-mcp-evaluate" });
    }
    const resolved = await ctx.runQuery(internal.mcp.media.resolveImageRefs, {
      refs,
    });
    const { images, skipped } = await loadImages(ctx.storage, resolved.found);
    const unusable = [...resolved.missing, ...skipped];
    if (unusable.length > 0) {
      return {
        ok: false,
        errorCode: "invalid_request",
        error: `images not usable: ${unusable.join(", ")}. Each needs a storageId from upload_media pointing at a PNG or JPEG under 16 MiB.`,
        retryable: false,
      };
    }
    return evaluateDecision(args, { tag: "eva-mcp-evaluate", images });
  },
});
