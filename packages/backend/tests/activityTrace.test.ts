import { describe, expect, test } from "bun:test";
import { parseActivityLog } from "@eva/shared/activityTrace";

describe("activity log", () => {
  test("keeps every step kind in order and drops malformed steps", () => {
    const steps = parseActivityLog(
      JSON.stringify([
        { type: "reasoning", label: "Thought", detail: "Find the table.", status: "complete" },
        { type: "read", label: "Read file", detail: "src/App.tsx", status: "complete" },
        { type: "edit", status: "complete" },
        { type: "todos", label: "Task list", status: "active", todos: [{ content: "Write it", status: "in_progress" }] },
        { type: "hook", label: "PreToolUse", status: "complete" },
        { type: "future_kind", label: "Unknown", status: "complete" },
        { type: "response", label: "Response", detail: "Done.", status: "complete" },
      ]),
    );
    expect(steps.map((step) => step.type)).toEqual(["reasoning", "read", "todos", "hook", "response"]);
    expect(steps[2]?.todos).toEqual([{ content: "Write it", status: "in_progress" }]);
  });

  test("keeps the fields the rows read: nesting, timing, errors and detail", () => {
    const [agent, child, command] = parseActivityLog(
      JSON.stringify([
        { type: "subtask", label: "Ran agent", detail: "Audit", status: "complete", toolUseId: "toolu_1" },
        { type: "read", label: "Read file", status: "complete", parentToolUseId: "toolu_1", hasHiddenDetail: true },
        {
          type: "bash",
          label: "Ran command",
          status: "complete",
          command: "pnpm test",
          output: { text: "1 failed", exitCode: 1 },
          isError: true,
          durationMs: 5400,
        },
      ]),
    );
    expect(agent?.toolUseId).toBe("toolu_1");
    expect(child).toMatchObject({ parentToolUseId: "toolu_1", hasHiddenDetail: true });
    expect(command).toMatchObject({ output: { text: "1 failed", exitCode: 1 }, isError: true, durationMs: 5400 });
  });

  test("legacy plain text, a non-list, empty and missing logs give no steps", () => {
    expect(parseActivityLog("Ran the tests")).toEqual([]);
    expect(parseActivityLog('{"type":"read"}')).toEqual([]);
    expect(parseActivityLog("[]")).toEqual([]);
    expect(parseActivityLog(undefined)).toEqual([]);
  });
});
