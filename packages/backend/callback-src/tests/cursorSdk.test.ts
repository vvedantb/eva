import { expect, test } from "vitest";
import { splitCursorModel } from "../config.js";
import { cursorSdkToolToStep } from "../parse/toolSteps.js";
import {
  cursorCompactionEventPhase,
  cursorParseLine,
  probeCursorSdkToolResult,
} from "../providers/cursor.js";
import {
  COST_LOOKUP_RETRY_DELAYS_MS,
  EMPTY_CURSOR_COST_SNAPSHOT,
  RESOURCE_EXHAUSTED_CHAT_MESSAGE,
  RESOURCE_EXHAUSTED_RETRY_DELAYS_MS,
  attributeCursorTurnRawCents,
  cursorModeParams,
  cursorModelCatalogJson,
  cursorEventHasVisibleActivity,
  cursorEventWaitTimeoutMs,
  cursorAgentStartupActivity,
  filterModeParamsByModel,
  isResourceExhaustedMessage,
  readCursorCostSnapshot,
  resolveCursorTurnCostUsd,
  runTurnWithResourceExhaustedRetries,
  canReplaceCursorAgent,
  shouldRetryStalledCursorCreate,
  shouldRetryStalledCursorResume,
  waitForCursorPhase,
  CursorPhaseTimeoutError,
  type CursorCostSnapshot,
  type CursorTurnOutcome,
} from "../providers/cursorSdk.js";

test("Cursor startup activity says whether context is resumed or created", () => {
  expect(
    cursorAgentStartupActivity({ mode: "resume", sessionId: "agent-47" }),
  ).toEqual({
    label: "Resuming Cursor agent...",
    detail: "Restoring saved context...",
  });
  expect(cursorAgentStartupActivity({ mode: "none", sessionId: null })).toEqual(
    {
      label: "Creating Cursor agent...",
      detail: "Creating a new model context...",
    },
  );
});

test("Cursor SDK phases fail on a bounded deadline", async () => {
  let timedOut = false;
  const never = new Promise<string>(() => {});
  await expect(
    waitForCursorPhase({
      task: never,
      phase: "starting the model run",
      timeoutMs: 5,
      onTimeout: () => {
        timedOut = true;
      },
    }),
  ).rejects.toEqual(new CursorPhaseTimeoutError("starting the model run", 5));
  expect(timedOut).toBe(true);
});

test("only a pre-output resumed Cursor stall is safe to replay", () => {
  expect(
    shouldRetryStalledCursorResume(
      new CursorPhaseTimeoutError("starting the model run", 60_000),
    ),
  ).toBe(true);
  expect(
    shouldRetryStalledCursorResume(
      new CursorPhaseTimeoutError("waiting for the first model event", 60_000),
    ),
  ).toBe(true);
  expect(
    shouldRetryStalledCursorResume(
      new CursorPhaseTimeoutError("waiting for the next model event", 60_000),
    ),
  ).toBe(false);
  expect(
    shouldRetryStalledCursorResume(
      new CursorPhaseTimeoutError("finishing the model run", 30_000),
    ),
  ).toBe(false);
});

test("only a missing Cursor store may replace the saved agent", () => {
  expect(canReplaceCursorAgent(new Error("agent_not_found"))).toBe(true);
  const gone: Error & { code?: string } = new Error("Agent not found");
  gone.code = "agent_not_found";
  expect(canReplaceCursorAgent(gone)).toBe(true);
  expect(
    canReplaceCursorAgent(
      new CursorPhaseTimeoutError("waiting for the first model event", 300_000),
    ),
  ).toBe(false);
  expect(
    canReplaceCursorAgent(
      new CursorPhaseTimeoutError("starting the model run", 60_000),
    ),
  ).toBe(false);
  expect(canReplaceCursorAgent(new Error("resource_exhausted"))).toBe(false);
});

test("only a stalled Cursor creation is replayed as a creation", () => {
  expect(
    shouldRetryStalledCursorCreate(
      new CursorPhaseTimeoutError("creating a fresh agent", 30_000),
    ),
  ).toBe(true);
  expect(
    shouldRetryStalledCursorCreate(
      new CursorPhaseTimeoutError("restoring saved context", 30_000),
    ),
  ).toBe(false);
  expect(
    shouldRetryStalledCursorCreate(
      new CursorPhaseTimeoutError("starting the model run", 60_000),
    ),
  ).toBe(false);
  expect(shouldRetryStalledCursorCreate(new Error("agent_not_found"))).toBe(
    false,
  );
});

test("the Cursor model catalog keeps only the ids and aliases the SDK matches on", () => {
  const json = cursorModelCatalogJson([
    {
      id: "grok-4.6",
      displayName: "Grok 4.6",
      aliases: ["grok"],
      parameters: [{ id: "reasoning", values: [{ value: "high" }] }],
    },
    { id: "composer-2.5", displayName: "Composer 2.5" },
  ]);
  expect(json).not.toBeNull();
  expect(JSON.parse(json ?? "[]")).toEqual([
    { id: "grok-4.6", aliases: ["grok"] },
    { id: "composer-2.5" },
  ]);
  // An empty list would make the SDK reject every model, non-retryably.
  expect(cursorModelCatalogJson([])).toBeNull();
});

test("Cursor silence policy distinguishes safe startup recovery from visible work", () => {
  expect(cursorEventHasVisibleActivity("thinking")).toBe(true);
  expect(cursorEventHasVisibleActivity("assistant")).toBe(true);
  expect(cursorEventHasVisibleActivity("tool_call")).toBe(true);
  expect(cursorEventHasVisibleActivity("status")).toBe(false);
  expect(cursorEventHasVisibleActivity("usage")).toBe(false);

  expect(
    cursorEventWaitTimeoutMs({
      sawVisibleActivity: false,
      lastEventAt: 1_000,
      now: 1_000,
      toolInFlight: false,
      compactionInFlight: false,
    }),
  ).toBe(300_000);
  // The pre-visible window rolls from the LAST event of any type: a stream
  // still emitting lifecycle events (status, usage, summaries) is alive, so
  // only total silence trips the stall — never a slow warm-up that talks.
  expect(
    cursorEventWaitTimeoutMs({
      sawVisibleActivity: false,
      lastEventAt: 31_000,
      now: 41_000,
      toolInFlight: false,
      compactionInFlight: false,
    }),
  ).toBe(290_000);
  // Once reasoning/text/tools are visible, a normal one-minute model pause is
  // not fatal. A much longer safety bound still catches a genuinely dead run.
  expect(
    cursorEventWaitTimeoutMs({
      sawVisibleActivity: true,
      lastEventAt: 1_000,
      now: 61_000,
      toolInFlight: false,
      compactionInFlight: false,
    }),
  ).toBe(300_000);
  expect(
    cursorEventWaitTimeoutMs({
      sawVisibleActivity: true,
      lastEventAt: 1_000,
      now: 61_000,
      toolInFlight: true,
      compactionInFlight: false,
    }),
  ).toBeGreaterThan(300_000);
  // An in-place compaction can outlast every silence budget; timing it out
  // would replace the very agent the resume-always design exists to keep.
  expect(
    cursorEventWaitTimeoutMs({
      sawVisibleActivity: false,
      lastEventAt: 0,
      now: 10_000_000,
      toolInFlight: false,
      compactionInFlight: true,
    }),
  ).toBeGreaterThan(300_000);
});

test("compaction lifecycle events are recognized and shown, never dropped", () => {
  expect(cursorCompactionEventPhase("summary-started")).toBe("started");
  expect(cursorCompactionEventPhase("summary_started")).toBe("started");
  expect(cursorCompactionEventPhase("summary-completed")).toBe("completed");
  expect(cursorCompactionEventPhase("summary_completed")).toBe("completed");
  expect(cursorCompactionEventPhase("thinking")).toBeNull();
  expect(cursorCompactionEventPhase("tool_use_summary")).toBeNull();

  expect(cursorParseLine({ type: "summary-started" })).toEqual([
    {
      kind: "update_thinking",
      label: "Compacting context...",
      detail: "Cursor is summarizing the conversation in place.",
    },
  ]);
  expect(cursorParseLine({ type: "summary-completed" })).toEqual([
    {
      kind: "update_thinking",
      label: "Context compacted",
      detail: "The agent continues with its history summarized in place.",
    },
  ]);
});

test("splitCursorModel separates base id and reasoning level", () => {
  expect(splitCursorModel("grok-4.6-xhigh")).toEqual({
    base: "grok-4.6",
    level: "xhigh",
  });
  expect(splitCursorModel("grok-4.6-high")).toEqual({
    base: "grok-4.6",
    level: "high",
  });
  expect(splitCursorModel("grok-4.5-low")).toEqual({
    base: "grok-4.5",
    level: "low",
  });
  expect(splitCursorModel("grok-4.5-medium")).toEqual({
    base: "grok-4.5",
    level: "medium",
  });
  // Legacy CLI-era slug persisted from pre-migration sessions.
  expect(splitCursorModel("cursor-grok-4.5-high")).toEqual({
    base: "grok-4.5",
    level: "high",
  });
  expect(splitCursorModel("gpt-5.5-low")).toEqual({
    base: "gpt-5.5",
    level: "low",
  });
  expect(splitCursorModel("composer-2.5")).toEqual({
    base: "composer-2.5",
    level: "",
  });
  expect(splitCursorModel("gemini-3.1-pro")).toEqual({
    base: "gemini-3.1-pro",
    level: "",
  });
});

test("cursorModeParams explicitly keeps first-party models on Standard", () => {
  expect(cursorModeParams("grok-4.6", false, false)).toEqual([
    { id: "fast", value: "false" },
  ]);
  expect(cursorModeParams("grok-4.5", false, false)).toEqual([
    { id: "fast", value: "false" },
  ]);
  expect(cursorModeParams("composer-2.5", true, false)).toEqual([
    { id: "fast", value: "true" },
  ]);
  expect(cursorModeParams("gpt-5.5", false, true)).toEqual([
    { id: "context", value: "1m" },
  ]);
});

test("filterModeParamsByModel keeps params the model declares", () => {
  const candidates = cursorModeParams("grok-4.5", false, true);
  const model = {
    id: "grok-4.5",
    parameters: [
      { id: "fast", values: [{ value: "true" }, { value: "false" }] },
      { id: "context", values: [{ value: "1m" }] },
    ],
  };
  expect(filterModeParamsByModel(candidates, model, opted(false, true))).toEqual([
    { id: "fast", value: "false" },
    { id: "context", value: "1m" },
  ]);
});

test("filterModeParamsByModel drops params the model does not declare", () => {
  const candidates = cursorModeParams("grok-4.5", false, true);
  const model = { id: "grok-4.5", parameters: [{ id: "reasoning" }] };
  expect(filterModeParamsByModel(candidates, model, opted(false, true))).toEqual(
    [],
  );
  // Declared id but undeclared value drops too.
  const wrongValue = {
    id: "grok-4.5",
    parameters: [{ id: "context", values: [{ value: "500k" }] }],
  };
  expect(
    filterModeParamsByModel(candidates, wrongValue, opted(false, true)),
  ).toEqual([]);
  // A declared id with an empty values list accepts any value.
  const openValues = { id: "grok-4.5", parameters: [{ id: "fast" }] };
  expect(
    filterModeParamsByModel(candidates, openValues, opted(false, true)),
  ).toEqual([{ id: "fast", value: "false" }]);
});

test("filterModeParamsByModel without a model entry keeps only opted-in params", () => {
  // Not opted in: the protective fast=false is dropped rather than sent blind.
  expect(
    filterModeParamsByModel(
      cursorModeParams("grok-4.5", false, false),
      undefined,
      opted(false, false),
    ),
  ).toEqual([]);
  // Opted in: best-effort send of exactly what the user asked for.
  expect(
    filterModeParamsByModel(
      cursorModeParams("grok-4.5", true, true),
      undefined,
      opted(true, true),
    ),
  ).toEqual([
    { id: "fast", value: "true" },
    { id: "context", value: "1m" },
  ]);
});

function opted(fastMode: boolean, use1mContext: boolean) {
  return { fastMode, use1mContext };
}

test("isResourceExhaustedMessage matches Cursor's Connect-RPC 429", () => {
  // Exact shape observed in prod (task 234, 17 Aug 2026).
  expect(isResourceExhaustedMessage("[resource_exhausted] Error")).toBe(true);
  expect(
    isResourceExhaustedMessage("[resource_exhausted] quota exceeded"),
  ).toBe(true);
  expect(isResourceExhaustedMessage("resource_exhausted")).toBe(true);
  expect(isResourceExhaustedMessage("[agent_not_found] Error")).toBe(false);
  expect(isResourceExhaustedMessage("network timeout")).toBe(false);
  expect(isResourceExhaustedMessage("")).toBe(false);
});

test("resource_exhausted chat message is readable, not the raw code alone", () => {
  expect(RESOURCE_EXHAUSTED_CHAT_MESSAGE).toContain("rate limit");
  expect(RESOURCE_EXHAUSTED_CHAT_MESSAGE).toContain("resource_exhausted");
  expect(RESOURCE_EXHAUSTED_CHAT_MESSAGE).toContain("try again");
});

/**
 * The prod failure (task 234, 17 Aug 2026): a Cursor turn rejected with
 * `resource_exhausted` died in ~40s with zero tokens and put the raw
 * `[resource_exhausted] Error` in the chat, even though the rate limit cleared
 * minutes later. These cover the retry policy that absorbs it — a regression
 * here puts the raw Connect-RPC code back in front of the user.
 */
const EXHAUSTED = "[resource_exhausted] Error";

function outcome(over: Partial<CursorTurnOutcome> = {}): CursorTurnOutcome {
  return {
    isError: false,
    resultText: "done",
    durationMs: 1_234,
    usage: {
      inputTokens: 10,
      outputTokens: 20,
      cacheReadTokens: 30,
      cacheWriteTokens: 40,
    },
    ...over,
  };
}

/** Drives the policy with scripted turns, recording backoff instead of waiting. */
function harness(turns: ReadonlyArray<CursorTurnOutcome | Error>) {
  const delays: number[] = [];
  let calls = 0;
  const run = () =>
    runTurnWithResourceExhaustedRetries({
      runTurn: async () => {
        const turn = turns[calls];
        calls++;
        if (turn === undefined) throw new Error("ran more turns than scripted");
        if (turn instanceof Error) throw turn;
        return turn;
      },
      aborted: () => false,
      onRetry: (delayMs) => delays.push(delayMs),
      sleep: async () => {},
    });
  return { run, delays, calls: () => calls };
}

test("a transient resource_exhausted result retries and the retry's result wins", async () => {
  const h = harness([
    outcome({ isError: true, resultText: EXHAUSTED }),
    outcome({ resultText: "recovered" }),
  ]);
  const result = await h.run();

  expect(h.calls()).toBe(2);
  expect(h.delays).toEqual([15_000]);
  // Only this outcome is emitted, so the swallowed failure never reaches the
  // parser as a result line.
  expect(result.isError).toBe(false);
  expect(result.resultText).toBe("recovered");
});

test("a thrown resource_exhausted error retries too, not just an error status", async () => {
  const h = harness([new Error(EXHAUSTED), outcome({ resultText: "ok" })]);
  const result = await h.run();

  expect(h.calls()).toBe(2);
  expect(result.resultText).toBe("ok");
});

test("resource_exhausted backs off 15s then 30s before giving up", async () => {
  const h = harness([
    outcome({ isError: true, resultText: EXHAUSTED }),
    outcome({ isError: true, resultText: EXHAUSTED }),
    outcome({ isError: true, resultText: EXHAUSTED }),
  ]);
  const result = await h.run();

  expect(h.delays).toEqual(RESOURCE_EXHAUSTED_RETRY_DELAYS_MS);
  expect(h.calls()).toBe(3);
  expect(result.isError).toBe(true);
  // The whole point of the fix: the user reads a remedy, never the raw code.
  expect(result.resultText).toBe(RESOURCE_EXHAUSTED_CHAT_MESSAGE);
  expect(result.resultText).not.toBe(EXHAUSTED);
});

test("a resource_exhausted throw past the retry budget still propagates", async () => {
  const h = harness([
    new Error(EXHAUSTED),
    new Error(EXHAUSTED),
    new Error(EXHAUSTED),
  ]);
  // The caller maps this to the readable message; it must not be mistaken for
  // a healthy turn, so it rejects rather than resolving with an empty result.
  await expect(h.run()).rejects.toThrow(EXHAUSTED);
  expect(h.calls()).toBe(3);
});

test("unrelated failures are never retried or reworded", async () => {
  const thrown = harness([new Error("[agent_not_found] Error")]);
  // agent_not_found has its own fresh-agent recovery upstream — swallowing it
  // here would break that path.
  await expect(thrown.run()).rejects.toThrow("agent_not_found");
  expect(thrown.calls()).toBe(1);

  const errored = harness([outcome({ isError: true, resultText: "boom" })]);
  const result = await errored.run();
  expect(errored.calls()).toBe(1);
  expect(errored.delays).toEqual([]);
  expect(result.resultText).toBe("boom");
});

test("a successful turn passes through untouched", async () => {
  const first = outcome();
  const h = harness([first]);

  await expect(h.run()).resolves.toEqual(first);
  expect(h.calls()).toBe(1);
  expect(h.delays).toEqual([]);
});

test("a timed-out attempt stops retrying and still reads as rate-limited", async () => {
  let calls = 0;
  const delays: number[] = [];
  const result = await runTurnWithResourceExhaustedRetries({
    runTurn: async () => {
      calls++;
      return outcome({ isError: true, resultText: EXHAUSTED });
    },
    // The health timer cancelled the run; sleeping 30s would burn the
    // remaining budget for a turn that can no longer finish.
    aborted: () => true,
    onRetry: (delayMs) => delays.push(delayMs),
    sleep: async () => {},
  });

  expect(calls).toBe(1);
  expect(delays).toEqual([]);
  expect(result.resultText).toBe(RESOURCE_EXHAUSTED_CHAT_MESSAGE);
});

test("cursorSdkToolToStep maps known SDK tool kinds", () => {
  const read = cursorSdkToolToStep("read", { path: "/tmp/repo/src/a.ts" });
  expect(read.type).toBe("read");
  expect(read.path).toBe("/tmp/repo/src/a.ts");

  const write = cursorSdkToolToStep("write", {
    path: "src/b.ts",
    fileText: "export const a = 1;",
  });
  expect(write.type).toBe("write");
  expect(write.contentPreview).toContain("export const a");

  const shell = cursorSdkToolToStep("shell", { command: "npm test" });
  expect(shell.type).toBe("bash");
  expect(shell.command).toBe("npm test");
  expect(shell.detail).toBe("npm test");

  const glob = cursorSdkToolToStep("glob", { globPattern: "**/*.ts" });
  expect(glob.type).toBe("search_files");
  expect(glob.detail).toBe("**/*.ts");

  const grep = cursorSdkToolToStep("grep", { pattern: "TODO" });
  expect(grep.type).toBe("search_code");
  expect(grep.detail).toBe("TODO");

  const del = cursorSdkToolToStep("delete", { path: "src/old.ts" });
  expect(del.type).toBe("edit");
  expect(del.label).toBe("Deleting file...");

  const mcp = cursorSdkToolToStep("mcp", { serverName: "linear" });
  expect(mcp.type).toBe("tool");
  expect(mcp.label).toBe("Using MCP linear...");

  const todos = cursorSdkToolToStep("updateTodos", {});
  expect(todos.label).toBe("Updating tasks...");
});

test("cursorSdkToolToStep falls back heuristically for unknown names", () => {
  const fetch = cursorSdkToolToStep("webFetch", {
    url: "https://example.com",
  });
  expect(fetch.type).toBe("web_fetch");

  const mystery = cursorSdkToolToStep("recordScreen", {});
  expect(mystery.type).toBe("tool");
  expect(mystery.label).toBe("Using recordScreen...");

  const unnamed = cursorSdkToolToStep("", {});
  expect(unnamed.label).toBe("Using tool...");
});

test("probeCursorSdkToolResult unwraps success envelopes", () => {
  const result = probeCursorSdkToolResult("completed", {
    status: "success",
    value: {
      exitCode: 0,
      stdout: "hello world",
      stderr: "",
      executionTime: 120,
    },
  });
  expect(result?.output?.text).toBe("hello world");
  expect(result?.output?.exitCode).toBe(0);
  expect(result?.durationMs).toBe(120);
  expect(result?.isError).toBeUndefined();
});

test("probeCursorSdkToolResult unwraps error envelopes and statuses", () => {
  const stringError = probeCursorSdkToolResult("error", {
    status: "error",
    error: "boom",
  });
  expect(stringError?.isError).toBe(true);
  expect(stringError?.output?.text).toBe("boom");

  const objectError = probeCursorSdkToolResult("error", {
    status: "error",
    error: { message: "tool exploded" },
  });
  expect(objectError?.isError).toBe(true);
  expect(objectError?.output?.text).toBe("tool exploded");

  const noPayload = probeCursorSdkToolResult("error", undefined);
  expect(noPayload).toEqual({ isError: true });

  const okNoPayload = probeCursorSdkToolResult("completed", undefined);
  expect(okNoPayload).toBeUndefined();
});

test("probeCursorSdkToolResult surfaces diffString and plain payloads", () => {
  const diff = probeCursorSdkToolResult("completed", {
    status: "success",
    value: { diffString: "-a\n+b", linesAdded: 1, linesRemoved: 1 },
  });
  expect(diff?.output?.text).toBe("-a\n+b");

  const plainString = probeCursorSdkToolResult("completed", "raw output");
  expect(plainString?.output?.text).toBe("raw output");

  const plainObject = probeCursorSdkToolResult("completed", {
    stdout: "direct",
    exitCode: 0,
  });
  expect(plainObject?.output?.text).toBe("direct");
});


const tokens = {
  inputTokens: 10,
  outputTokens: 5,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 15,
};

/** An `AgentUsage` as `agent.getUsage()` returns it for a local agent. */
function agentUsage(
  totalRawCents: number | null,
  runs: [string, number | null][],
) {
  return {
    usage: tokens,
    ...(totalRawCents === null
      ? {}
      : { cost: { rawCostCents: totalRawCents, chargedCents: 0 } }),
    runs: runs.map(([runId, rawCents]) => ({
      runId,
      usage: tokens,
      ...(rawCents === null
        ? {}
        : { cost: { rawCostCents: rawCents, chargedCents: 0 } }),
    })),
  };
}

test("readCursorCostSnapshot normalizes AgentUsage and unreported cost", () => {
  expect(readCursorCostSnapshot(agentUsage(7.5, [["uuid-a", 7.5]]))).toEqual({
    totalRawCents: 7.5,
    entries: [{ runId: "uuid-a", rawCents: 7.5 }],
  });
  // Cost absent on the totals and on a turn group both read as "not reported".
  expect(readCursorCostSnapshot(agentUsage(null, [["uuid-a", null]]))).toEqual({
    totalRawCents: null,
    entries: [{ runId: "uuid-a", rawCents: null }],
  });
  // Nothing to read from is an empty snapshot, never a throw.
  expect(readCursorCostSnapshot(undefined)).toEqual(EMPTY_CURSOR_COST_SNAPSHOT);
  expect(readCursorCostSnapshot({ runs: "not-an-array" })).toEqual(
    EMPTY_CURSOR_COST_SNAPSHOT,
  );
  // A group without a usage UUID cannot be diffed, so it is not an entry.
  expect(readCursorCostSnapshot({ runs: [{ usage: tokens }] })).toEqual({
    totalRawCents: null,
    entries: [],
  });
});

test("attributeCursorTurnRawCents charges only this turn's usage groups", () => {
  const before = readCursorCostSnapshot(agentUsage(30, [["prior", 30]]));
  const after = readCursorCostSnapshot(
    agentUsage(42, [
      ["prior", 30],
      ["this-turn", 12],
    ]),
  );
  expect(attributeCursorTurnRawCents(before, after)).toBe(12);

  // A fresh agent starts from the empty baseline: everything is this turn's.
  expect(
    attributeCursorTurnRawCents(
      EMPTY_CURSOR_COST_SNAPSHOT,
      readCursorCostSnapshot(agentUsage(12, [["this-turn", 12]])),
    ),
  ).toBe(12);
});

test("attributeCursorTurnRawCents ignores a prior turn's late-landing cost", () => {
  // The previous turn's group existed at snapshot time with no cost yet; its
  // cost landing during this turn belongs to that turn, not to this one.
  const before = readCursorCostSnapshot(agentUsage(null, [["prior", null]]));
  const after = readCursorCostSnapshot(
    agentUsage(30, [
      ["prior", 30],
      ["this-turn", null],
    ]),
  );
  expect(attributeCursorTurnRawCents(before, after)).toBeNull();
});

test("attributeCursorTurnRawCents is null until this turn's cost lands", () => {
  const before = readCursorCostSnapshot(agentUsage(30, [["prior", 30]]));
  // The group exists but carries no cost yet — retry rather than report 0.
  expect(
    attributeCursorTurnRawCents(
      before,
      readCursorCostSnapshot(
        agentUsage(30, [
          ["prior", 30],
          ["this-turn", null],
        ]),
      ),
    ),
  ).toBeNull();
  // A reported 0 is an answer, not a gap: request-priced usage bills 0 raw.
  expect(
    attributeCursorTurnRawCents(
      before,
      readCursorCostSnapshot(
        agentUsage(30, [
          ["prior", 30],
          ["this-turn", 0],
        ]),
      ),
    ),
  ).toBe(0);
});

test("attributeCursorTurnRawCents counts growth in the uuid-less remainder", () => {
  // Local events the backend records without a usage UUID only ever move the
  // totals, so the totals-minus-groups remainder is their only trace.
  const before = readCursorCostSnapshot(agentUsage(30, [["prior", 30]]));
  const after = readCursorCostSnapshot(
    agentUsage(50, [
      ["prior", 30],
      ["this-turn", 12],
    ]),
  );
  expect(attributeCursorTurnRawCents(before, after)).toBe(20);

  // A shrinking remainder never becomes a negative charge.
  expect(
    attributeCursorTurnRawCents(
      readCursorCostSnapshot(agentUsage(50, [["prior", 30]])),
      readCursorCostSnapshot(agentUsage(40, [["prior", 30]])),
    ),
  ).toBeNull();
});

test("resolveCursorTurnCostUsd converts raw cents to dollars", async () => {
  const usd = await resolveCursorTurnCostUsd({
    before: EMPTY_CURSOR_COST_SNAPSHOT,
    fetchAfter: async () =>
      readCursorCostSnapshot(agentUsage(12.3456789, [["this-turn", 12.3456789]])),
    sleep: async () => {},
  });
  expect(usd).toBe(0.123457);
});

test("resolveCursorTurnCostUsd polls while the backend lags, then gives up", async () => {
  const delays: number[] = [];
  let calls = 0;
  const pending = await resolveCursorTurnCostUsd({
    before: EMPTY_CURSOR_COST_SNAPSHOT,
    fetchAfter: async () => {
      calls++;
      return readCursorCostSnapshot(agentUsage(null, [["this-turn", null]]));
    },
    sleep: async (delayMs) => delays.push(delayMs),
  });
  // Cost is eventually consistent, so a gap is not final until the budget is.
  expect(calls).toBe(COST_LOOKUP_RETRY_DELAYS_MS.length + 1);
  expect(delays).toEqual([...COST_LOOKUP_RETRY_DELAYS_MS]);
  // Never fails the turn: a missing cost is simply omitted downstream.
  expect(pending).toBeUndefined();

  const lateDelays: number[] = [];
  let lateCalls = 0;
  const landed = await resolveCursorTurnCostUsd({
    before: EMPTY_CURSOR_COST_SNAPSHOT,
    fetchAfter: async () => {
      lateCalls++;
      return readCursorCostSnapshot(
        agentUsage(null, [["this-turn", lateCalls > 1 ? 250 : null]]),
      );
    },
    sleep: async (delayMs) => lateDelays.push(delayMs),
  });
  expect(lateCalls).toBe(2);
  expect(lateDelays).toEqual([COST_LOOKUP_RETRY_DELAYS_MS[0]]);
  expect(landed).toBe(2.5);
});

test("resolveCursorTurnCostUsd degrades to no cost when a lookup fails", async () => {
  // A failed pre-send baseline on a resumed agent: charging the agent's whole
  // history to this turn would be worse than reporting nothing.
  const noBaseline: CursorCostSnapshot | null = null;
  let calls = 0;
  expect(
    await resolveCursorTurnCostUsd({
      before: noBaseline,
      fetchAfter: async () => {
        calls++;
        return readCursorCostSnapshot(agentUsage(999, [["prior", 999]]));
      },
      sleep: async () => {},
    }),
  ).toBeUndefined();
  expect(calls).toBe(0);

  // Every post-run lookup throwing (wrapped by the caller into null) is a gap.
  expect(
    await resolveCursorTurnCostUsd({
      before: EMPTY_CURSOR_COST_SNAPSHOT,
      fetchAfter: async () => null,
      sleep: async () => {},
    }),
  ).toBeUndefined();
});
