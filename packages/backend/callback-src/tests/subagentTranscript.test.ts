import { afterEach, describe, expect, test } from "vitest";
import { applyCanonicalEvents, parseToCanonical } from "../parse/canonical.js";
import { toolCallToStep } from "../parse/toolSteps.js";
import { callbackState as S, resetStateForTests } from "../runtime/state.js";

/**
 * With `forwardSubagentText` the SDK sends a subagent's own text and thinking
 * under `parent_tool_use_id`. They feed the subagent's child thread view and
 * must never reach the parent's reply or reasoning.
 */

afterEach(() => {
  resetStateForTests();
});

function apply(event: Parameters<typeof parseToCanonical>[0]): void {
  applyCanonicalEvents(parseToCanonical(event, "claude"));
}

describe("subagent transcript capture", () => {
  test("subagent text becomes a nested response step, not parent reply", () => {
    apply({
      type: "assistant",
      parent_tool_use_id: "toolu_agent",
      message: {
        content: [
          { type: "thinking", thinking: "private subagent thoughts" },
          { type: "text", text: "Found the bug in auth.ts" },
        ],
      },
    });

    expect(S.currentStreamedContent).toBe("");
    expect(S.accumulatedSteps).toEqual([
      {
        type: "response",
        label: "Agent message",
        status: "complete",
        parentToolUseId: "toolu_agent",
        output: { text: "Found the bug in auth.ts" },
      },
    ]);
  });

  test("subagent partial text deltas are ignored", () => {
    apply({
      type: "stream_event",
      parent_tool_use_id: "toolu_agent",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "leak" },
      },
    });

    expect(S.currentStreamedContent).toBe("");
  });

  test("main-agent text still streams into the reply", () => {
    apply({
      type: "assistant",
      parent_tool_use_id: null,
      message: { content: [{ type: "text", text: "Done." }] },
    });

    expect(S.currentStreamedContent).toBe("Done.");
  });

  test("Agent step carries its prompt for the child thread", () => {
    const step = toolCallToStep("Agent", {
      description: "Find the bug",
      prompt: "  Look through auth.ts  ",
    });

    expect(step.type).toBe("subtask");
    expect(step.contentPreview).toBe("Look through auth.ts");
  });
});
