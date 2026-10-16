import { describe, expect, it } from "vitest";
import type { ActivityStep } from "@eva/ui";
import { buildSubagentThread, isEmptySubagentThread } from "./subagentThread";

const agentRow: ActivityStep = {
  type: "subtask",
  label: "Ran agent",
  detail: "Find the bug",
  status: "complete",
  toolUseId: "toolu_a",
  contentPreview: "Look through auth.ts",
  output: { text: "The bug is on line 4." },
};

function child(step: Partial<ActivityStep>): ActivityStep {
  return {
    type: "read",
    label: "Read file",
    status: "complete",
    parentToolUseId: "toolu_a",
    ...step,
  };
}

describe("buildSubagentThread", () => {
  it("folds prompt, tool runs, messages and result in order", () => {
    const thread = buildSubagentThread(
      [
        agentRow,
        child({ detail: "auth.ts" }),
        child({ type: "search_code", label: "Searched" }),
        child({
          type: "response",
          label: "Agent message",
          output: { text: "Checking." },
        }),
        child({ detail: "login.ts" }),
        // Another agent's step and a main-agent step stay out.
        child({ parentToolUseId: "toolu_b" }),
        { type: "bash", label: "Ran", status: "complete" },
      ],
      "toolu_a",
      true,
    );

    expect(thread.prompt).toBe("Look through auth.ts");
    expect(thread.blocks.map((block) => block.kind)).toEqual([
      "steps",
      "text",
      "steps",
    ]);
    expect(thread.blocks[0]).toMatchObject({ kind: "steps", steps: [{}, {}] });
    expect(thread.result).toBe("The bug is on line 4.");
  });

  it("drops a result the last message already said", () => {
    const thread = buildSubagentThread(
      [
        agentRow,
        child({ type: "response", output: { text: "The bug is on line 4." } }),
      ],
      "toolu_a",
      true,
    );
    expect(thread.result).toBeUndefined();
  });

  it("skips the launch notice of a backgrounded agent", () => {
    const thread = buildSubagentThread([agentRow], "toolu_a", false);
    expect(thread.result).toBeUndefined();
  });

  it("is empty when nothing of the agent was recorded", () => {
    expect(
      isEmptySubagentThread(buildSubagentThread([], "toolu_a", true)),
    ).toBe(true);
  });
});
