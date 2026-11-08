import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";
import type * as ConvexClient from "../http/convexClient.js";

// Only the network call is faked; the pure envelope reader
// (`unwrapConvexMutationPayload`) must stay real so the `{ status, value }`
// shape below is unwrapped exactly as it is in production.
vi.mock("../http/convexClient.js", async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexClient>()),
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
const originalEntityField = process.env.ENTITY_ID_FIELD;

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
    // Blocking on an answer is session-only behaviour, so the gate needs the
    // session entity field to take that path at all.
    process.env.ENTITY_ID_FIELD = "sessionId";
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

/**
 * Sessions 417 and 419: a turn held its sandbox for 2 hours waiting on an
 * answer, then the cap killed it and the question was lost. Past the wait the
 * poll releases the question instead; `release` still returns an answer that
 * landed at the deadline.
 */
describe("pollForAnswer releases the question after the wait", () => {
  async function pollWith(releaseAnswer: string | null) {
    vi.resetModules();
    const client = await import("../http/convexClient.js");
    const calls: string[] = [];
    // With no wait left the poll makes exactly one call: the release.
    vi.mocked(client.callConvexWithRetry).mockImplementationOnce(
      async (_type, path) => {
        calls.push(path);
        return {
          status: "success",
          value: {
            answer: path === "pendingQuestions:release" ? releaseAnswer : null,
          },
        };
      },
    );
    const { pollForAnswer } = await import("../runtime/pendingQuestion.js");
    const outcome = await pollForAnswer(
      "toolu_q",
      new AbortController().signal,
      0,
    );
    return { outcome, calls };
  }

  test("an unanswered question is released", async () => {
    const { outcome, calls } = await pollWith(null);
    expect(outcome).toEqual({ kind: "released" });
    expect(calls).toEqual(["pendingQuestions:release"]);
  });

  test("an answer that lands at the deadline is still taken", async () => {
    const { outcome } = await pollWith('{"Which?":"A"}');
    expect(outcome).toEqual({ kind: "answered", answer: '{"Which?":"A"}' });
  });

  test("a released question is saved for the turn's message, not lost", async () => {
    // `release` deletes the row, so `pendingQuestionData` is the only copy
    // left: without it the turn ends and the card never renders.
    process.env.CLAIM_MUTATION = "sessionWorkflow:claimPendingTurn";
    process.env.ENTITY_ID_FIELD = "sessionId";
    vi.resetModules();
    const client = await import("../http/convexClient.js");
    const { buildCanUseTool, QUESTION_RELEASED_MESSAGE, QUESTION_WAIT_MS } =
      await import("../runtime/pendingQuestion.js");
    const { callbackState } = await import("../runtime/state.js");
    const realNow = Date.now.bind(Date);
    let skippedMs = 0;
    const clock = vi
      .spyOn(Date, "now")
      .mockImplementation(() => realNow() + skippedMs);
    const calls: string[] = [];
    // The first unanswered poll jumps the clock past the wait, so the next
    // poll is the release.
    vi.mocked(client.callConvexWithRetry).mockImplementation(
      async (_type, path) => {
        calls.push(path);
        if (path === "pendingQuestions:claimAnswer") {
          skippedMs = QUESTION_WAIT_MS;
        }
        return { status: "success", value: { answer: null } };
      },
    );
    const input = {
      questions: [{ question: "Which?", options: [{ label: "A" }] }],
    };
    try {
      const result = await buildCanUseTool()("AskUserQuestion", input, {
        toolUseID: "toolu_q",
        signal: new AbortController().signal,
      });
      expect(result).toEqual({
        behavior: "deny",
        message: QUESTION_RELEASED_MESSAGE,
      });
      expect(calls.at(-1)).toBe("pendingQuestions:release");
      expect(callbackState.pendingQuestionData).toBe(JSON.stringify(input));
      expect(callbackState.awaitingQuestionAnswer).toBe(false);
    } finally {
      clock.mockRestore();
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
    vi.resetModules();
    const { buildCanUseTool } = await import("../runtime/pendingQuestion.js");
    return buildCanUseTool();
  }

  const options = () => ({
    toolUseID: "toolu_test",
    signal: new AbortController().signal,
  });

  for (const field of ["taskId", "projectId", "sessionId"]) {
    test(`${field}: an MCP tool is allowed`, async () => {
      const canUseTool = await gateFor(field);
      const result = await canUseTool("mcp__eva__list_repos", {}, options());
      expect(result.behavior).toBe("allow");
    });
  }

  test("a non-session surface lets AskUserQuestion through instead of blocking", async () => {
    // Would hang on postQuestion/pollForAnswer if it tried to block here —
    // nothing on a task chat can answer it.
    const canUseTool = await gateFor("taskId");
    const result = await canUseTool(
      "AskUserQuestion",
      { questions: [] },
      options(),
    );
    expect(result.behavior).toBe("allow");
  });
});

describe("the permission mode is not tied to blocking questions", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(here, "../providers/claudeSdk.ts"), "utf8");

  test("canUseTool is installed for every agent turn", () => {
    expect(source).toContain('tools === "agent"\n      ? {');
    expect(source).not.toContain(
      'tools === "agent" && BLOCKING_QUESTIONS_ENABLED',
    );
  });
});
