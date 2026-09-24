import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
  const source = readFileSync(
    join(here, "../providers/claudeSdk.ts"),
    "utf8",
  );

  test("canUseTool is installed for every agent turn", () => {
    expect(source).toContain('tools === "agent"\n      ? {');
    expect(source).not.toContain(
      'tools === "agent" && BLOCKING_QUESTIONS_ENABLED',
    );
  });
});
