"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { composeChatUiPanel } from "../_generativeUi/compose";
import type { ComposeOutcome } from "../_generativeUi/schema";

/**
 * Composes one chat UI panel with TypeSafe Jev (via Vercel AI Gateway). The
 * `render_ui` MCP tool is the only caller; it has already parsed the input,
 * but `composeChatUiPanel` re-parses so a direct action call is held to the
 * same caps. Errors come back as data, matching `runEvaluate`.
 */
export const composePanel = internalAction({
  args: {
    prompt: v.string(),
    title: v.optional(v.string()),
    blocks: v.any(),
  },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      spec: v.string(),
      elementCount: v.number(),
      elapsedMs: v.number(),
      inputTokens: v.union(v.number(), v.null()),
      stopReason: v.union(
        v.literal("finish"),
        v.literal("limit"),
        v.literal("unavailable"),
      ),
    }),
    v.object({
      ok: v.literal(false),
      errorCode: v.union(
        v.literal("missing_config"),
        v.literal("invalid_request"),
        v.literal("provider_error"),
      ),
      error: v.string(),
    }),
  ),
  handler: async (_ctx, args): Promise<ComposeOutcome> =>
    composeChatUiPanel({
      prompt: args.prompt,
      ...(args.title !== undefined ? { title: args.title } : {}),
      blocks: args.blocks,
    }),
});
