import { expect, test } from "bun:test";
import { splitCursorModel } from "../config.js";
import {
  cursorCompactionEventPhase,
  cursorParseLine,
} from "../providers/cursor.js";
import {
  COST_LOOKUP_RETRY_DELAYS_MS,
  EMPTY_CURSOR_COST_SNAPSHOT,
  RESOURCE_EXHAUSTED_CHAT_MESSAGE,
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
  expect(
    cursorEventWaitTimeoutMs({
      sawVisibleActivity: false,
      lastEventAt: 31_000,
      now: 41_000,
      toolInFlight: false,
      compactionInFlight: false,
    }),
  ).toBe(290_000);
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
  expect(cursorModeParams("grok-4.7", false, false)).toEqual([
    { id: "fast", value: "false" },
  ]);
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
    displayName: "Grok 4.5",
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
  const model = {
    id: "grok-4.5",
    displayName: "Grok 4.5",
    parameters: [{ id: "reasoning", values: [] }],
  };
  expect(filterModeParamsByModel(candidates, model, opted(false, true))).toEqual(
    [],
  );
  const wrongValue = {
    id: "grok-4.5",
    displayName: "Grok 4.5",
    parameters: [{ id: "context", values: [{ value: "500k" }] }],
  };
  expect(
    filterModeParamsByModel(candidates, wrongValue, opted(false, true)),
  ).toEqual([]);
  const openValues = {
    id: "grok-4.5",
    displayName: "Grok 4.5",
    parameters: [{ id: "fast", values: [] }],
  };
  expect(
    filterModeParamsByModel(candidates, openValues, opted(false, true)),
  ).toEqual([{ id: "fast", value: "false" }]);
});

test("filterModeParamsByModel without a model entry keeps only opted-in params", () => {
  expect(
    filterModeParamsByModel(
      cursorModeParams("grok-4.5", false, false),
      undefined,
      opted(false, false),
    ),
  ).toEqual([]);
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
  expect(isResourceExhaustedMessage("[resource_exhausted] Error")).toBe(true);
  expect(
    isResourceExhaustedMessage("[resource_exhausted] quota exceeded"),
  ).toBe(true);
  expect(isResourceExhaustedMessage("resource_exhausted")).toBe(true);
  expect(isResourceExhaustedMessage("[agent_not_found] Error")).toBe(false);
  expect(isResourceExhaustedMessage("network timeout")).toBe(false);
  expect(isResourceExhaustedMessage("")).toBe(false);
});

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

  expect(h.delays).toEqual([15_000, 30_000]);
  expect(h.calls()).toBe(3);
  expect(result.isError).toBe(true);
  expect(result.resultText).toBe(RESOURCE_EXHAUSTED_CHAT_MESSAGE);
});

test("a resource_exhausted throw past the retry budget still propagates", async () => {
  const h = harness([
    new Error(EXHAUSTED),
    new Error(EXHAUSTED),
    new Error(EXHAUSTED),
  ]);
  await expect(h.run()).rejects.toThrow(EXHAUSTED);
  expect(h.calls()).toBe(3);
});

test("unrelated failures are never retried or reworded", async () => {
  const thrown = harness([new Error("[agent_not_found] Error")]);
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
    aborted: () => true,
    onRetry: (delayMs) => delays.push(delayMs),
    sleep: async () => {},
  });

  expect(calls).toBe(1);
  expect(delays).toEqual([]);
  expect(result.resultText).toBe(RESOURCE_EXHAUSTED_CHAT_MESSAGE);
});

const tokens = {
  inputTokens: 10,
  outputTokens: 5,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 15,
};

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
  expect(readCursorCostSnapshot(agentUsage(null, [["uuid-a", null]]))).toEqual({
    totalRawCents: null,
    entries: [{ runId: "uuid-a", rawCents: null }],
  });
  expect(readCursorCostSnapshot(undefined)).toEqual(EMPTY_CURSOR_COST_SNAPSHOT);
  expect(readCursorCostSnapshot({ runs: "not-an-array" })).toEqual(
    EMPTY_CURSOR_COST_SNAPSHOT,
  );
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

  expect(
    attributeCursorTurnRawCents(
      EMPTY_CURSOR_COST_SNAPSHOT,
      readCursorCostSnapshot(agentUsage(12, [["this-turn", 12]])),
    ),
  ).toBe(12);
});

test("attributeCursorTurnRawCents ignores a prior turn's late-landing cost", () => {
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
  const before = readCursorCostSnapshot(agentUsage(30, [["prior", 30]]));
  const after = readCursorCostSnapshot(
    agentUsage(50, [
      ["prior", 30],
      ["this-turn", 12],
    ]),
  );
  expect(attributeCursorTurnRawCents(before, after)).toBe(20);

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
    sleep: async (delayMs) => {
      delays.push(delayMs);
    },
  });
  expect(calls).toBe(COST_LOOKUP_RETRY_DELAYS_MS.length + 1);
  expect(delays).toEqual([...COST_LOOKUP_RETRY_DELAYS_MS]);
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
    sleep: async (delayMs) => {
      lateDelays.push(delayMs);
    },
  });
  expect(lateCalls).toBe(2);
  expect(lateDelays).toEqual([COST_LOOKUP_RETRY_DELAYS_MS[0]]);
  expect(landed).toBe(2.5);
});

test("resolveCursorTurnCostUsd degrades to no cost when a lookup fails", async () => {
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

  expect(
    await resolveCursorTurnCostUsd({
      before: EMPTY_CURSOR_COST_SNAPSHOT,
      fetchAfter: async () => null,
      sleep: async () => {},
    }),
  ).toBeUndefined();
});
