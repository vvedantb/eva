import { afterEach, describe, expect, mock, test, vi } from "bun:test";
import { freshModules } from "./freshModules";

// Only the network call is faked; the pure envelope reader
// (`unwrapConvexMutationPayload`) must stay real so the `{ status, value }`
// shape below is unwrapped exactly as it is in production.
const realClient = { ...(await import("../http/convexClient.js")) };
const answering: typeof realClient.callConvexWithRetry = async (_type, path) =>
  path === "pendingQuestions:claimAnswer"
    ? {
        status: "success",
        value: {
          answer: JSON.stringify({ "Which?": "A", ignored: 1 }),
        },
      }
    : null;
const callConvexWithRetry = mock(answering);
mock.module("../http/convexClient.js", () => ({
  ...realClient,
  callConvexWithRetry,
}));

/**
 * Bun has no `advanceTimersByTimeAsync`: step fake time and let the awaits
 * between polls run, so a timer set after an await still fires.
 */
async function advanceTimersByTimeAsync(ms: number): Promise<void> {
  for (let elapsed = 0; elapsed < ms; elapsed += 500) {
    vi.advanceTimersByTime(Math.min(500, ms - elapsed));
    for (let flush = 0; flush < 10; flush += 1) {
      await new Promise<void>((resolve) => queueMicrotask(resolve));
    }
  }
}

const originalClaim = process.env.CLAIM_MUTATION;
const originalEntityField = process.env.ENTITY_ID_FIELD;

/** The SDK's per-call permission options for one tool use. */
function permissionOptions(toolUseID: string) {
  return {
    toolUseID,
    requestId: "req_" + toolUseID,
    signal: new AbortController().signal,
  };
}

afterEach(() => {
  if (originalClaim === undefined) {
    delete process.env.CLAIM_MUTATION;
  } else {
    process.env.CLAIM_MUTATION = originalClaim;
  }
  if (originalEntityField === undefined) {
    delete process.env.ENTITY_ID_FIELD;
  } else {
    process.env.ENTITY_ID_FIELD = originalEntityField;
  }
  vi.useRealTimers();
  // Back to the answering mock with no recorded calls.
  callConvexWithRetry.mockReset();
  callConvexWithRetry.mockImplementation(answering);
  freshModules();
});

describe("buildCanUseTool Agent/Task background policy", () => {
  test("daemon (CLAIM_MUTATION set) allows run_in_background for Agent", async () => {
    process.env.CLAIM_MUTATION = "sessionWorkflow:claimPendingTurn";
    freshModules();
    const { buildCanUseTool } = await import("../runtime/pendingQuestion.js");
    const canUseTool = buildCanUseTool();
    const result = await canUseTool(
      "Agent",
      { run_in_background: true },
      permissionOptions("toolu_test"),
    );
    expect(result?.behavior).toBe("allow");
    if (result?.behavior === "allow") {
      expect(result.updatedInput?.run_in_background).toBe(true);
    }
  });

  test("one-shot (no CLAIM_MUTATION) coerces Agent to foreground", async () => {
    delete process.env.CLAIM_MUTATION;
    freshModules();
    const { buildCanUseTool } = await import("../runtime/pendingQuestion.js");
    const canUseTool = buildCanUseTool();
    const result = await canUseTool(
      "Task",
      { run_in_background: true },
      permissionOptions("toolu_test"),
    );
    expect(result?.behavior).toBe("allow");
    if (result?.behavior === "allow") {
      expect(result.updatedInput?.run_in_background).toBe(false);
    }
  });
});

describe("buildCanUseTool AskUserQuestion answers", () => {
  test("records the user's string answers under the tool_use id", async () => {
    process.env.CLAIM_MUTATION = "sessionWorkflow:claimPendingTurn";
    // Blocking on an answer is session-only behaviour, so the gate needs the
    // session entity field to take that path at all.
    process.env.ENTITY_ID_FIELD = "sessionId";
    freshModules();
    const { buildCanUseTool } = await import("../runtime/pendingQuestion.js");
    const { callbackState } = await import("../runtime/state.js");
    const canUseTool = buildCanUseTool();
    const result = await canUseTool(
      "AskUserQuestion",
      { questions: [{ question: "Which?", options: [{ label: "A" }] }] },
      permissionOptions("toolu_q"),
    );
    expect(result?.behavior).toBe("allow");
    if (result?.behavior === "allow") {
      expect(result.updatedInput?.answers).toEqual({
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

/**
 * Sessions 417 and 419: a turn held its sandbox for 2 hours waiting on an
 * answer, then the cap killed it and the question was lost. Past the wait the
 * gate releases the question instead; `release` still returns an answer that
 * landed at the deadline.
 */
describe("AskUserQuestion past the wait", () => {
  const input = {
    questions: [{ question: "Which?", options: [{ label: "A" }] }],
  };

  async function askPastTheWait(releaseAnswer: string | null) {
    process.env.CLAIM_MUTATION = "sessionWorkflow:claimPendingTurn";
    process.env.ENTITY_ID_FIELD = "sessionId";
    freshModules();
    const { buildCanUseTool, QUESTION_WAIT_MS } =
      await import("../runtime/pendingQuestion.js");
    const { callbackState } = await import("../runtime/state.js");
    const calls: string[] = [];
    callConvexWithRetry.mockImplementation(async (_type, path) => {
      calls.push(path);
      return {
        status: "success",
        value: {
          answer: path === "pendingQuestions:release" ? releaseAnswer : null,
        },
      };
    });
    vi.useFakeTimers();
    const pending = buildCanUseTool()(
      "AskUserQuestion",
      input,
      permissionOptions("toolu_q"),
    );
    await advanceTimersByTimeAsync(QUESTION_WAIT_MS + 1000);
    const result = await pending;
    return { result, calls, callbackState };
  }

  test("an answer that lands at the deadline is still taken", async () => {
    const { result, calls, callbackState } =
      await askPastTheWait('{"Which?":"A"}');
    expect(result).toEqual({
      behavior: "allow",
      updatedInput: { ...input, answers: { "Which?": "A" } },
    });
    expect(calls.at(-1)).toBe("pendingQuestions:release");
    expect(callbackState.pendingQuestionData).toBe("");
    callbackState.questionAnswers.clear();
  });

  test("a released question is saved for the turn's message, not lost", async () => {
    // `release` deletes the row, so `pendingQuestionData` is the only copy
    // left: without it the turn ends and the card never renders.
    const { result, calls, callbackState } = await askPastTheWait(null);
    const { QUESTION_RELEASED_MESSAGE } =
      await import("../runtime/pendingQuestion.js");
    try {
      expect(result).toEqual({
        behavior: "deny",
        message: QUESTION_RELEASED_MESSAGE,
      });
      expect(calls.at(-1)).toBe("pendingQuestions:release");
      expect(callbackState.pendingQuestionData).toBe(JSON.stringify(input));
      expect(callbackState.awaitingQuestionAnswer).toBe(false);
    } finally {
      callbackState.pendingQuestionData = "";
    }
  });
});

/**
 * Regression: task and project chats could not call any `mcp__eva__*` tool,
 * read-only ones included.
 *
 * `bypassPermissions` auto-allows built-in tools but leaves MCP tools gated — an
 * external MCP server is a trust boundary the bypass does not cross. Only
 * `canUseTool` is consulted for MCP calls, and it used to be installed for
 * sessions alone (`BLOCKING_QUESTIONS_ENABLED`), so every other surface silently
 * lost MCP. The gate now goes on for every agent turn; BLOCKING_QUESTIONS_ENABLED
 * narrowed to the one thing it names, AskUserQuestion.
 */
describe("the canUseTool gate grants MCP on every surface", () => {
  async function gateFor(entityIdField: string | undefined) {
    if (entityIdField === undefined) {
      delete process.env.ENTITY_ID_FIELD;
    } else {
      process.env.ENTITY_ID_FIELD = entityIdField;
    }
    freshModules();
    const { buildCanUseTool } = await import("../runtime/pendingQuestion.js");
    return buildCanUseTool();
  }

  const options = () => permissionOptions("toolu_test");

  test("an MCP tool is allowed on a task chat", async () => {
    const canUseTool = await gateFor("taskId");
    const result = await canUseTool("mcp__eva__list_repos", {}, options());
    expect(result?.behavior).toBe("allow");
  });

  test("a surface with no answering UI lets AskUserQuestion through instead of blocking", async () => {
    // Would hang on postQuestion/pollForAnswer if it tried to block here —
    // nothing on a doc chat can answer it.
    const canUseTool = await gateFor("docId");
    const result = await canUseTool(
      "AskUserQuestion",
      { questions: [] },
      options(),
    );
    expect(result).toEqual({
      behavior: "allow",
      updatedInput: { questions: [] },
    });
    expect(callConvexWithRetry).not.toHaveBeenCalled();
  });
});
