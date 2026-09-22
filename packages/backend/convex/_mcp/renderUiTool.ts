/**
 * The `render_ui` MCP tool: the agent hands Eva the content of a panel, Jev
 * lays it out, and the panel renders inline in the chat.
 *
 * The request contract — the input schema and its caps — lives in
 * `_generativeUi/schema.ts`, shared with the composition client. What stays
 * here is the agent-facing surface: the description, the error copy and the
 * tool factory. Composition and storage are injected as `run`, which keeps the
 * Convex types out of this module and lets tests pass a fake.
 */

import { defineTool, type EvaTool } from "../mcp/registry";
import { errorResult, textResult } from "../mcp/toolShared";
import {
  MAX_BLOCKS,
  renderUiInput,
  renderUiInputShape,
  type ComposeOutcome,
  type RenderUiInput,
} from "../_generativeUi/schema";

/** What a successful call reports back once the panel is stored. */
export type RenderUiResult =
  | { ok: true; panelId: string; elementCount: number; elapsedMs: number }
  | { ok: false; outcome: Extract<ComposeOutcome, { ok: false }> };

/** Agent-facing message for a failed composition; never echoes the request. */
export function renderUiErrorMessage(
  outcome: Extract<ComposeOutcome, { ok: false }>,
): string {
  switch (outcome.errorCode) {
    case "missing_config":
      return `render_ui is not configured: ${outcome.error} Set AI_GATEWAY_API_KEY on the Eva Convex deployment.`;
    case "invalid_request":
      return `render_ui rejected the request: ${outcome.error}`;
    case "provider_error":
      return `render_ui could not compose the panel: ${outcome.error}`;
  }
}

export const RENDER_UI_DESCRIPTION = `Render a small interactive panel inline in this chat, under your current reply. Use it when a result is easier to read as a layout than as prose — a set of numbers, a checklist, a before/after table, a screenshot with a caption — or when you want to offer the user one-tap replies instead of asking them to type.

You supply the content, Eva lays it out. Every word the panel shows comes from \`blocks\`; \`prompt\` only describes the arrangement you want, and a fast decision model (TypeSafe Jev) picks the layout from Eva's component catalog. Nothing you do not write can appear on screen, and the whole call usually settles in a second or two.

Block kinds: heading, text, metric, badge, callout, progress, checklist, table, keyValue, code, image, button.

Buttons are the interactive part. A button with \`reply\` posts that text back to you as a chat message when the user presses it, so it is the cheap way to ask a closed question ("Ship it" / "Show me the diff" / "Not now"). A button with \`url\` opens a link instead. Do not put a button on a panel that is purely informational.

Example: { "prompt": "a row of three metrics above a short summary, then two buttons", "title": "Test run", "blocks": [ { "kind": "metric", "label": "Passed", "value": "128", "tone": "positive" }, { "kind": "metric", "label": "Failed", "value": "2", "tone": "danger" }, { "kind": "metric", "label": "Duration", "value": "41s" }, { "kind": "text", "text": "Both failures are in the billing suite and look like the same timeout." }, { "kind": "button", "label": "Fix them", "reply": "fix the two billing timeouts", "variant": "primary" }, { "kind": "button", "label": "Show the logs", "reply": "show me the failing test logs" } ] }

Limits: up to ${MAX_BLOCKS} blocks per panel, one panel per call. Requires a session, quick task or project sandbox. Keep copy short — the panel is about as wide as a chat message. Do not use it for long prose (write that in your reply) or to replace a file you should be editing.`;

/**
 * Builds the tool over an injected composition-and-store call. `tools.ts`
 * passes the Convex path; tests pass a fake. The handler re-parses with the
 * full schema so the caps apply before anything leaves the process.
 */
export function renderUiTool(
  run: (input: RenderUiInput) => Promise<RenderUiResult>,
): EvaTool {
  return defineTool({
    name: "render_ui",
    description: RENDER_UI_DESCRIPTION,
    mutating: true,
    input: renderUiInputShape,
    handler: async (args) => {
      const parsed = renderUiInput.safeParse(args);
      if (!parsed.success) {
        return errorResult(
          `Invalid render_ui input: ${parsed.error.issues
            .map(
              (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
            )
            .join("; ")}`,
        );
      }
      const result = await run(parsed.data);
      if (!result.ok) return errorResult(renderUiErrorMessage(result.outcome));
      return textResult({
        panelId: result.panelId,
        elementCount: result.elementCount,
        elapsedMs: result.elapsedMs,
        status: "rendered",
      });
    },
  });
}
