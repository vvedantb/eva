import { afterEach, describe, expect, test, vi } from "vitest";

// Only the network call is faked; the pure envelope reader
// (`unwrapConvexMutationPayload`) must stay real so the `{ status, value }`
// shape below is unwrapped exactly as it is in production.
vi.mock("../http/convexClient.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../http/convexClient.js")>()),
  callConvexWithRetry: vi.fn(async (_type: string, path: string) =>
    path === "pendingQuestions:claimAnswer"
      ? {
          status: "success",
          value: {
            answer: JSON.stringify({ "Which?": "A", ignored: 1 }),
          },
        }
      : null,
  ),
}));

const originalClaim = process.env.CLAIM_MUTATION;

afterEach(() => {
  if (originalClaim === undefined) {
    delete process.env.CLAIM_MUTATION;
  } else {
    process.env.CLAIM_MUTATION = originalClaim;
  }
  vi.resetModules();
});

describe("buildCanUseTool Agent/Task background policy", () => {
  test("daemon (CLAIM_MUTATION set) allows run_in_background for Agent", async () => {
    process.env.CLAIM_MUTATION = "sessionWorkflow:claimPendingTurn";
    vi.resetModules();
    const { buildCanUseTool } = await import("../runtime/pendingQuestion.js");
    const canUseTool = buildCanUseTool();
    const result = await canUseTool(
      "Agent",
      { run_in_background: true },
      { toolUseID: "toolu_test", signal: new AbortController().signal },
    );
    expect(result.behavior).toBe("allow");
    if (result.behavior === "allow") {
      expect(result.updatedInput.run_in_background).toBe(true);
    }
  });

  test("one-shot (no CLAIM_MUTATION) coerces Agent to foreground", async () => {
    delete process.env.CLAIM_MUTATION;
    vi.resetModules();
    const { buildCanUseTool } = await import("../runtime/pendingQuestion.js");
    const canUseTool = buildCanUseTool();
    const result = await canUseTool(
      "Task",
      { run_in_background: true },
      { toolUseID: "toolu_test", signal: new AbortController().signal },
    );
    expect(result.behavior).toBe("allow");
    if (result.behavior === "allow") {
      expect(result.updatedInput.run_in_background).toBe(false);
    }
  });
});

describe("buildCanUseTool AskUserQuestion answers", () => {
  test("records the user's string answers under the tool_use id", async () => {
    process.env.CLAIM_MUTATION = "sessionWorkflow:claimPendingTurn";
    vi.resetModules();
    const { buildCanUseTool } = await import("../runtime/pendingQuestion.js");
    const { callbackState } = await import("../runtime/state.js");
    const canUseTool = buildCanUseTool();
    const result = await canUseTool(
      "AskUserQuestion",
      { questions: [{ question: "Which?", options: [{ label: "A" }] }] },
      { toolUseID: "toolu_q", signal: new AbortController().signal },
    );
    expect(result.behavior).toBe("allow");
    if (result.behavior === "allow") {
      expect(result.updatedInput.answers).toEqual({
        "Which?": "A",
        ignored: 1,
      });
    }
    // Non-string answers are dropped from the persisted copy.
    expect(callbackState.questionAnswers.get("toolu_q")).toEqual({
      "Which?": "A",
    });
    callbackState.questionAnswers.clear();
  });
});
