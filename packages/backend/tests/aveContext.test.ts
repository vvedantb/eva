import { describe, expect, test } from "vitest";
import {
  AVE_CONTEXT_CHAR_BUDGET,
  buildModelMessages,
} from "../convex/_ave/context";

/**
 * Ave has no provider-side transcript: these rows are its whole memory, so a
 * replay that silently degrades would make it forget which agents it started.
 */
describe("buildModelMessages", () => {
  test("user rows become user messages; alerts and empty rows are skipped", () => {
    expect(
      buildModelMessages([
        { role: "user", content: "list my agents" },
        { role: "assistant", content: "", isSystemAlert: false },
        { role: "assistant", content: "Ave errored", isSystemAlert: true },
      ]),
    ).toEqual([{ role: "user", content: "list my agents" }]);
  });

  test("assistant rows replay their exact tool calls and results", () => {
    const replay = [
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "list_agents",
            input: {},
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call_1",
            toolName: "list_agents",
            output: { type: "text", value: "[]" },
          },
        ],
      },
      { role: "assistant", content: "No agents are running." },
    ];
    const messages = buildModelMessages([
      { role: "user", content: "anything running?" },
      {
        role: "assistant",
        content: "No agents are running.",
        modelMessages: JSON.stringify(replay),
      },
    ]);
    expect(messages).toHaveLength(4);
    expect(messages[2].role).toBe("tool");
  });

  test("an unreadable replay falls back to the visible reply", () => {
    for (const modelMessages of ["{not json", JSON.stringify([{ role: "nope" }])]) {
      expect(
        buildModelMessages([
          { role: "assistant", content: "Started it.", modelMessages },
        ]),
      ).toEqual([{ role: "assistant", content: "Started it." }]);
    }
  });

  test("the oldest turns drop first once the budget is spent", () => {
    const big = "x".repeat(AVE_CONTEXT_CHAR_BUDGET / 2);
    const messages = buildModelMessages([
      { role: "user", content: `old ${big}` },
      { role: "user", content: `mid ${big}` },
      { role: "user", content: "newest" },
    ]);
    expect(messages.map((m) => String(m.content).slice(0, 3))).toEqual([
      "mid",
      "new",
    ]);
  });

  test("the newest turn survives even when it alone is over budget", () => {
    const huge = "y".repeat(AVE_CONTEXT_CHAR_BUDGET * 2);
    expect(buildModelMessages([{ role: "user", content: huge }])).toHaveLength(1);
  });
});
