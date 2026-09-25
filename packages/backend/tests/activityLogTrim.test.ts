import { describe, expect, test } from "vitest";
import { trimActivityLogForTranscript } from "../convex/_messages/activityLog";

type ParsedStep = Record<string, string | boolean | object>;

function steps(value: string | undefined): ParsedStep[] {
  return JSON.parse(value ?? "[]");
}

describe("trimActivityLogForTranscript", () => {
  test("drops the expanded-only fields and marks the row", () => {
    const log = JSON.stringify([
      {
        type: "bash",
        label: "Ran tests",
        status: "complete",
        command: "pnpm test",
        detail: "pnpm test",
        output: { text: "x".repeat(5000), exitCode: 0 },
      },
    ]);

    const trimmed = trimActivityLogForTranscript(log);

    expect(String(trimmed).length).toBeLessThan(log.length / 10);
    expect(steps(trimmed)[0]).toEqual({
      type: "bash",
      label: "Ran tests",
      status: "complete",
      command: "pnpm test",
      detail: "pnpm test",
      hasHiddenDetail: true,
    });
  });

  test("drops edits and write previews", () => {
    const log = JSON.stringify([
      {
        type: "edit",
        label: "Edited a.ts",
        status: "complete",
        edits: [{ oldText: "before", newText: "after" }],
      },
      {
        type: "write",
        label: "Wrote b.ts",
        status: "complete",
        contentPreview: "hello",
      },
    ]);

    const trimmed = steps(trimActivityLogForTranscript(log));

    expect(trimmed[0]).not.toHaveProperty("edits");
    expect(trimmed[1]).not.toHaveProperty("contentPreview");
    expect(trimmed.every((step) => step.hasHiddenDetail === true)).toBe(true);
  });

  test("keeps a sub-agent's report, which renders outside any disclosure", () => {
    const log = JSON.stringify([
      {
        type: "subtask",
        label: "Ran agent",
        status: "complete",
        toolUseId: "tu_1",
        output: { text: "the final report" },
      },
    ]);

    expect(trimActivityLogForTranscript(log)).toBe(log);
  });

  test("keeps the reasoning text, which renders as prose", () => {
    const log = JSON.stringify([
      { type: "reasoning", label: "Thought", status: "complete", detail: "why" },
    ]);

    expect(trimActivityLogForTranscript(log)).toBe(log);
  });

  test("returns non-step payloads untouched", () => {
    expect(trimActivityLogForTranscript(undefined)).toBeUndefined();
    expect(trimActivityLogForTranscript("")).toBe("");
    expect(trimActivityLogForTranscript("[]")).toBe("[]");
    expect(trimActivityLogForTranscript("legacy plain text")).toBe(
      "legacy plain text",
    );
  });
});
