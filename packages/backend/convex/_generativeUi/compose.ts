"use node";

/**
 * The one place Eva composes a chat UI panel.
 *
 * json-render's experimental composition asks TypeSafe Jev a series of typed
 * choice questions — "which candidate is the root", "what goes next, and under
 * which parent" — instead of asking a language model to write JSON. Every
 * answer is picked from candidates we built, so composition is fast and the
 * output cannot contain anything the catalog does not define.
 *
 * Imports stay confined to json-render, the shared catalog and the two leaf
 * modules beside this file; reaching into `mcp/*` would put a `"use node"`
 * chunk in an import cycle, which breaks the Convex prod push.
 */

import {
  experimental_composeSpec,
  experimental_createEvaluator,
  type Spec,
} from "@json-render/core";
import { chatUiCatalog } from "@eva/shared/generativeUi";
import { buildChatUiCandidates } from "./candidates";
import { appendMissingBlocks } from "./completeness";
import {
  MAX_PANEL_ELEMENTS,
  renderUiInput,
  type ComposeOutcome,
  type RenderUiInputRaw,
} from "./schema";

/** Jev answers each question in well under a second. */
const EVALUATION_TIMEOUT_MS = 15_000;
/** Whole-panel budget; a composition that needs longer is a bad request. */
const COMPOSITION_TIMEOUT_MS = 60_000;
/** Gateway id, matching the `evaluate` MCP tool. */
const EVALUATION_MODEL = "typesafe-ai/jev";

const INSTRUCTIONS = {
  root: "Use Panel as the root when the whole thing is one titled card. Use a vertical Stack when there are several sections. Use Grid as root only when every top-level item is a peer of the same kind, such as a row of metrics.",
  next: "Place metrics side by side in a Grid, buttons side by side in a horizontal Stack, and give tables, code and images a full-width slot of their own. Include every content block exactly once. Prefer a shallow tree.",
  parent:
    "Never put a paragraph, table, code block or image inside a horizontal Stack. Buttons belong in the button row, not beside body copy.",
};

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

function countElements(spec: Spec): number {
  return Object.keys(spec.elements).length;
}

/**
 * Composes one panel from the agent's blocks. Errors come back as data rather
 * than throwing, so the MCP tool can report a readable failure and the agent
 * can carry on with its turn.
 */
export async function composeChatUiPanel(
  input: RenderUiInputRaw,
): Promise<ComposeOutcome> {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    return {
      ok: false,
      errorCode: "missing_config",
      error: "AI_GATEWAY_API_KEY is not set on this Convex deployment.",
    };
  }

  const parsed = renderUiInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: "invalid_request",
      error: parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; "),
    };
  }
  const { prompt, title, blocks } = parsed.data;

  const candidates = buildChatUiCandidates(blocks, title);
  // Leave room for the layout the composer wraps the blocks in, but never let
  // one call spend more evaluations than a panel can justify.
  const maxElements = Math.min(blocks.length + 8, MAX_PANEL_ELEMENTS);

  try {
    let composed: Spec | null = null;
    let stopReason: "finish" | "limit" | "unavailable" = "unavailable";
    let elapsedMs = 0;
    let inputTokens: number | null = null;

    for await (const event of experimental_composeSpec({
      catalog: chatUiCatalog,
      candidates,
      prompt,
      evaluate: experimental_createEvaluator({
        apiKey,
        model: EVALUATION_MODEL,
        timeoutMs: EVALUATION_TIMEOUT_MS,
      }),
      maxElements,
      maxSteps: maxElements,
      maxDepth: 4,
      signal: AbortSignal.timeout(COMPOSITION_TIMEOUT_MS),
      instructions: INSTRUCTIONS,
      context: {
        surface:
          "An Eva chat panel rendered inline under an agent reply, about the width of a chat message. Buttons post a reply back to the agent when pressed.",
      },
    })) {
      if (event.type !== "complete") continue;
      composed = event.spec;
      stopReason = event.stopReason;
      elapsedMs = event.elapsedMs;
      inputTokens = event.inputTokens;
    }

    if (composed === null) {
      return {
        ok: false,
        errorCode: "provider_error",
        error: `Composition produced no panel (${stopReason}).`,
      };
    }

    // Selection is an independent include/omit decision per candidate, so a
    // composition can drop content the agent asked for. Put it back before
    // validating — the panel's promise is that every block is shown.
    const { spec: complete, appended } = appendMissingBlocks(
      composed,
      candidates,
    );
    if (appended > 0) {
      console.warn(
        `[generativeUi] composition omitted ${appended} of ${blocks.length} blocks; appended to the root`,
      );
    }

    const validated = chatUiCatalog.validate(complete);
    if (!validated.success) {
      return {
        ok: false,
        errorCode: "provider_error",
        error: "Composition produced a spec the catalog rejected.",
      };
    }

    return {
      ok: true,
      spec: JSON.stringify(complete),
      elementCount: countElements(complete),
      elapsedMs,
      inputTokens,
      stopReason,
    };
  } catch (error) {
    const message = messageOf(error);
    console.error("[generativeUi] compose failed:", message);
    return { ok: false, errorCode: "provider_error", error: message };
  }
}
