import { describe, expect, test } from "bun:test";
import { buildStaleDocPatch } from "../convex/_prRecapWorkflow/staleDoc";

const NOW = 1_800_000_000_000;

describe("buildStaleDocPatch", () => {
  test("flips a pending recap to a recoverable error", () => {
    const patch = buildStaleDocPatch({ prRecapStatus: "pending" }, NOW);

    expect(patch.activeWorkflowId).toBeUndefined();
    expect(patch.prRecapStatus).toBe("error");
    expect(patch.prRecapError).toBe("Recap generation timed out");
    expect(patch.updatedAt).toBe(NOW);
  });

  test("never re-errors a recap that already finished", () => {
    expect(buildStaleDocPatch({ prRecapStatus: "ready" }, NOW)).toEqual({
      activeWorkflowId: undefined,
    });
    expect(buildStaleDocPatch({ prRecapStatus: "error" }, NOW)).toEqual({
      activeWorkflowId: undefined,
    });
    expect(buildStaleDocPatch({}, NOW)).toEqual({
      activeWorkflowId: undefined,
    });
  });

  test("flips a running test-gen job to error independently of the recap", () => {
    const patch = buildStaleDocPatch(
      { testGenStatus: "running", prRecapStatus: "pending" },
      NOW,
    );

    expect(patch.testGenStatus).toBe("error");
    expect(patch.prRecapStatus).toBe("error");
  });

  test("leaves a completed test-gen job untouched", () => {
    expect(
      buildStaleDocPatch({ testGenStatus: "completed" }, NOW).testGenStatus,
    ).toBeUndefined();
  });

  test("marks a dangling empty assistant turn so the chat stops hanging", () => {
    const patch = buildStaleDocPatch(
      {
        interviewHistory: [
          { role: "user", content: "write the spec" },
          { role: "assistant", content: "" },
        ],
      },
      NOW,
    );

    expect(patch.interviewHistory?.[1]?.content).toBe(
      JSON.stringify({ error: true }),
    );
  });

  test("does not overwrite an assistant turn that already produced content", () => {
    const patch = buildStaleDocPatch(
      {
        interviewHistory: [{ role: "assistant", content: "already answered" }],
      },
      NOW,
    );

    expect(patch.interviewHistory?.[0]?.content).toBe("already answered");
  });
});
