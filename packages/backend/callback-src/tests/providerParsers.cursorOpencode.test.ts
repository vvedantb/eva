import { readFileSync } from "fs";
import { join } from "path";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { callbackState as S, resetStateForTests } from "../runtime/state.js";
import type {
  CanonicalEvent,
  JsonObject,
  JsonValue,
  ToolCompleteResult,
} from "../types.js";
import { cursorAdapter, cursorParseLine } from "../providers/cursor.js";
import { opencodeAdapter, opencodeParseLine } from "../providers/opencode.js";

const sessionCalls: string[] = [];

mock.module("../session/cursorSession.js", () => ({
  writeCursorSessionState: () => sessionCalls.push("cursor:write"),
  syncCursorStateToPersist: () => sessionCalls.push("cursor:sync"),
}));

mock.module("../session/opencodeSession.js", () => ({
  writeOpencodeSessionState: () => sessionCalls.push("opencode:write"),
  syncOpencodeStateToPersist: () => sessionCalls.push("opencode:sync"),
}));

beforeEach(() => {
  resetStateForTests();
  S.activeCursorSessionId = "";
  S.activeOpencodeSessionId = "";
  S.opencodeFinalMessageId = "";
  S.firstAssistantEventAt = 0;
  sessionCalls.length = 0;
});

function cursorToolResult(
  status: string,
  result?: JsonValue,
): ToolCompleteResult | undefined {
  const event: JsonObject = { type: "tool_call", status, name: "shell" };
  if (result !== undefined) event.result = result;
  const last = cursorParseLine(event).at(-1);
  return last?.kind === "complete_tool" ? last.result : undefined;
}

function fixtureEvents(name: string): JsonObject[] {
  return readFileSync(join(import.meta.dirname, "fixtures", name), "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line): JsonObject => JSON.parse(line));
}

const MALFORMED_EVENTS: JsonObject[] = [
  {},
  { type: null },
  { type: 7 },
  { type: [] },
  { type: {} },
  { type: "" },
  { type: "mystery", payload: [1, 2, 3] },
  { type: "system", agent_id: [] },
  { type: "assistant", message: "not-an-object" },
  { type: "assistant", message: { content: "not-an-array" } },
  { type: "assistant", message: { content: [null, 1, "x", [], {}] } },
  { type: "thinking", text: { nested: true } },
  { type: "tool_call", status: [], name: {}, args: [], call_id: 5 },
  { type: "tool_call", status: "completed", result: [[{ message: "x" }]] },
  { type: "tool_call", status: "error", result: Number.NaN },
  { type: "result", result: null },
  { type: "reasoning", part: [] },
  { type: "text", part: { text: [] } },
  { type: "tool_use", part: "nope" },
  { type: "tool_use", part: { state: [] } },
  { type: "tool_use", part: { state: { status: {}, time: [] } } },
  { type: "step_finish", part: [] },
  { type: "step_finish", part: { reason: 5 } },
  { type: "step_start", sessionID: [] },
];

describe("the Cursor SDK parser", () => {
  test("maps a whole SDK stream to the events the feed replays", () => {
    const events = fixtureEvents("cursor-sdk-events.jsonl").flatMap(
      (event): CanonicalEvent[] => {
        cursorAdapter.onStreamLine("", event);
        return cursorParseLine(event);
      },
    );

    expect(events.map((event) => event.kind)).toEqual([
      "update_thinking",
      "stream_text_delta",
      "update_reasoning",
      "push_step",
      "complete_tool",
      "push_step",
      "complete_tool",
      "push_step",
      "complete_tool",
      "mark_last_complete",
    ]);
    expect(events[4]).toEqual({
      kind: "complete_tool",
      trackingId: "call_cursor1",
      result: {
        output: { text: "total 12", exitCode: 0 },
        durationMs: 42,
      },
    });
    expect(events[6]).toMatchObject({
      result: { output: { text: "-const x = 1\n+const x = 2" } },
    });
    expect(events[8]).toMatchObject({
      result: {
        output: { text: "command exited with status 1" },
        isError: true,
      },
    });
    expect(S.resultEventSeen).toBe(true);
  });

  test("keeps the result field a malformed sibling would have lost", () => {
    expect(
      cursorToolResult("completed", {
        status: "success",
        value: { diffString: 5, executionTime: 99 },
      }),
    ).toEqual({ durationMs: 99 });
    expect(
      cursorToolResult("completed", {
        status: "success",
        value: { diffString: " -a ", executionTime: "99" },
      }),
    ).toEqual({ output: { text: "-a" } });
    expect(
      cursorToolResult("completed", {
        status: "success",
        value: { executionTime: Number.NaN },
      }),
    ).toBeUndefined();
    expect(
      cursorToolResult("error", {
        status: "error",
        error: { message: "   " },
      }),
    ).toEqual({ isError: true });
    expect(
      cursorToolResult("error", {
        status: "error",
        error: { message: "tool exploded" },
      }),
    ).toEqual({ output: { text: "tool exploded" }, isError: true });
    expect(
      cursorToolResult("error", {
        status: "error",
        error: { message: 5, stdout: "fallback" },
      }),
    ).toEqual({ output: { text: "fallback" }, isError: true });
  });

  test("an envelope missing its payload is probed as a plain result", () => {
    expect(
      cursorToolResult("completed", { status: "success" }),
    ).toBeUndefined();
    expect(
      cursorToolResult("completed", { status: "success", value: null }),
    ).toBeUndefined();
    expect(cursorToolResult("error", { status: "success" })).toEqual({
      isError: true,
    });
    expect(cursorToolResult("error", undefined)).toEqual({
      isError: true,
    });
    expect(cursorToolResult("completed", undefined)).toBeUndefined();
    expect(cursorToolResult("completed", "raw output")).toEqual({
      output: { text: "raw output" },
      isError: undefined,
    });
    expect(
      cursorToolResult("completed", { stdout: "direct", exitCode: 0 }),
    ).toMatchObject({ output: { text: "direct", exitCode: 0 } });
  });

  test("call ids are trimmed, and a blank id pushes without tracking", () => {
    const padded = cursorParseLine({
      type: "tool_call",
      status: "running",
      call_id: "  call_pad  ",
      name: "shell",
      args: { command: "ls" },
    });
    expect(padded).toEqual([
      {
        kind: "push_step",
        step: {
          type: "bash",
          label: "Running command...",
          detail: "ls",
          command: "ls",
          status: "active",
          toolUseId: "call_pad",
        },
        trackingId: "call_pad",
      },
    ]);
    expect(
      cursorParseLine({
        type: "tool_call",
        status: "running",
        call_id: "call_pad",
        name: "shell",
        args: { command: "ls" },
      }),
    ).toEqual([]);

    const blank = cursorParseLine({
      type: "tool_call",
      status: "running",
      call_id: "   ",
      name: "shell",
    });
    expect(blank).toHaveLength(1);
    expect(blank[0]).toEqual({
      kind: "push_step",
      step: {
        type: "bash",
        label: "Running command...",
        status: "active",
      },
    });

    const terminal = cursorParseLine({
      type: "tool_call",
      status: "error",
      call_id: "call_fresh",
      name: "shell",
    });
    expect(terminal.map((event) => event.kind)).toEqual([
      "push_step",
      "complete_tool",
    ]);
    expect(terminal[1]).toEqual({
      kind: "complete_tool",
      trackingId: "call_fresh",
      result: { isError: true },
    });
    expect(
      cursorParseLine({
        type: "tool_call",
        status: "error",
        call_id: "call_fresh",
        name: "shell",
      }),
    ).toEqual([]);
  });

  test("assistant deltas keep every non-empty text block, in order", () => {
    expect(
      cursorParseLine({
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "" },
            { type: "tool_use", text: "ignored" },
            { type: "text", text: "second" },
            { type: "text", text: "  " },
            { type: "text", text: 5 },
          ],
        },
      }),
    ).toEqual([
      { kind: "stream_text_delta", text: "second" },
      { kind: "stream_text_delta", text: "  " },
    ]);
    expect(
      cursorParseLine({
        type: "assistant",
        message: { content: { type: "text", text: "x" } },
      }),
    ).toEqual([]);
    expect(
      cursorParseLine({
        type: "assistant",
        message: [{ type: "text", text: "x" }],
      }),
    ).toEqual([]);
  });

  test("thinking text reaches the reasoning row unmodified", () => {
    expect(cursorParseLine({ type: "thinking", text: "  keep  " })).toEqual([
      { kind: "update_reasoning", text: "  keep  " },
    ]);
    expect(cursorParseLine({ type: "thinking", text: "" })).toEqual([]);
    expect(cursorParseLine({ type: "thinking" })).toEqual([]);
  });

  test("a system event captures a trimmed agent id exactly once", () => {
    expect(
      cursorAdapter.onStreamLine("", {
        type: "system",
        agent_id: "  agent_9  ",
      }),
    ).toEqual({ needsHeartbeat: true });
    expect(S.activeCursorSessionId).toBe("agent_9");
    expect(sessionCalls).toEqual(["cursor:write"]);

    expect(
      cursorAdapter.onStreamLine("", { type: "system", agent_id: "agent_9" }),
    ).toEqual({});
    expect(
      cursorAdapter.onStreamLine("", { type: "system", agent_id: "   " }),
    ).toEqual({});
    expect(
      cursorAdapter.onStreamLine("", { type: "system", agent_id: 5 }),
    ).toEqual({});
    expect(S.activeCursorSessionId).toBe("agent_9");
    expect(sessionCalls).toEqual(["cursor:write"]);
  });

  test("no malformed event throws, and unknown types produce nothing", () => {
    for (const event of MALFORMED_EVENTS) {
      expect(() => cursorParseLine(event)).not.toThrow();
      expect(() => cursorAdapter.onStreamLine("", event)).not.toThrow();
    }
    expect(cursorParseLine({ type: "mystery" })).toEqual([]);
    expect(cursorParseLine({ type: " tool_call " })).toEqual([]);
    expect(cursorParseLine({})).toEqual([]);
    expect(cursorParseLine({ type: "summary_started" })).toEqual([
      {
        kind: "update_thinking",
        label: "Compacting context...",
        detail: "Cursor is summarizing the conversation in place.",
      },
    ]);
    expect(cursorParseLine({ type: "summary-Started" })).toEqual([]);
  });
});

describe("the OpenCode parser", () => {
  test("maps a tool part's lifecycle to a push and its completion", () => {
    const events = fixtureEvents("opencode-tool.jsonl").flatMap(
      (event): CanonicalEvent[] => {
        opencodeAdapter.onStreamLine("", event);
        return opencodeParseLine(event);
      },
    );

    expect(events.map((event) => event.kind)).toEqual([
      "push_step",
      "complete_tool",
      "push_step",
      "complete_tool",
    ]);
    expect(events[0]).toMatchObject({ trackingId: "part_oc1" });
    expect(events[1]).toEqual({
      kind: "complete_tool",
      trackingId: "part_oc1",
      result: {
        output: { text: "/tmp/repo", exitCode: 0 },
        durationMs: 100,
      },
    });
    expect(events[3]).toEqual({
      kind: "complete_tool",
      trackingId: "part_oc2",
      result: { output: { text: "exit status 1", exitCode: 1 }, isError: true },
    });
  });

  test("part text is forwarded exactly, and only when it is text", () => {
    expect(
      opencodeParseLine({ type: "reasoning", part: { text: "  keep  " } }),
    ).toEqual([{ kind: "update_reasoning", text: "  keep  " }]);
    expect(
      opencodeParseLine({ type: "text", part: { text: "hello" } }),
    ).toEqual([{ kind: "append_text", text: "hello" }]);
    const unusable: JsonValue[] = [
      { text: "" },
      { text: 5 },
      {},
      ["text"],
      "text",
    ];
    for (const part of unusable) {
      expect(opencodeParseLine({ type: "text", part })).toEqual([]);
      expect(opencodeParseLine({ type: "reasoning", part })).toEqual([]);
    }
  });

  test("only the three known tool statuses produce events", () => {
    const part = (status: JsonValue): JsonObject => ({
      type: "tool_use",
      part: { id: "part_1", tool: "bash", state: { status } },
    });
    expect(opencodeParseLine(part("running"))).toHaveLength(1);
    expect(opencodeParseLine(part("completed"))).toHaveLength(1);
    expect(opencodeParseLine(part("error"))).toHaveLength(1);
    expect(opencodeParseLine(part(" running"))).toEqual([]);
    expect(opencodeParseLine(part("pending"))).toEqual([]);
    expect(opencodeParseLine(part(5))).toEqual([]);
    expect(
      opencodeParseLine({ type: "tool_use", part: { id: "p", tool: "bash" } }),
    ).toEqual([]);
    expect(opencodeParseLine({ type: "tool_use", part: [] })).toEqual([]);
  });

  test("a stopping step ends the turn, with or without a usable message id", () => {
    expect(
      opencodeParseLine({
        type: "step_finish",
        part: { reason: "stop", messageID: "msg_7" },
      }),
    ).toEqual([{ kind: "mark_last_complete" }]);
    opencodeAdapter.onStreamLine("", {
      type: "step_finish",
      part: { reason: "stop", messageID: "msg_7" },
    });
    expect(S.opencodeFinalMessageId).toBe("msg_7");
    expect(S.resultEventSeen).toBe(true);
    expect(sessionCalls).toEqual(["opencode:sync"]);

    resetStateForTests();
    S.opencodeFinalMessageId = "";
    sessionCalls.length = 0;
    opencodeAdapter.onStreamLine("", {
      type: "step_finish",
      part: { reason: "stop", messageID: 5 },
    });
    expect(S.resultEventSeen).toBe(true);
    expect(S.opencodeFinalMessageId).toBe("");
    expect(sessionCalls).toEqual(["opencode:sync"]);

    resetStateForTests();
    sessionCalls.length = 0;
    expect(
      opencodeParseLine({ type: "step_finish", part: { reason: " stop" } }),
    ).toEqual([]);
    opencodeAdapter.onStreamLine("", {
      type: "step_finish",
      part: { reason: "length" },
    });
    expect(S.resultEventSeen).toBe(false);
    expect(sessionCalls).toEqual([]);
  });

  test("a session id is captured trimmed, and only when it changes", () => {
    expect(
      opencodeAdapter.onStreamLine("", {
        type: "step_start",
        sessionID: " s1 ",
      }),
    ).toEqual({ needsHeartbeat: true });
    expect(S.activeOpencodeSessionId).toBe("s1");
    expect(
      opencodeAdapter.onStreamLine("", { type: "step_start", sessionID: "s1" }),
    ).toEqual({});
    expect(
      opencodeAdapter.onStreamLine("", { type: "step_start", sessionID: "  " }),
    ).toEqual({});
    expect(
      opencodeAdapter.onStreamLine("", { type: "step_start", sessionID: [] }),
    ).toEqual({});
    expect(S.activeOpencodeSessionId).toBe("s1");
    expect(sessionCalls).toEqual(["opencode:write"]);
  });

  test("no malformed event throws", () => {
    for (const event of MALFORMED_EVENTS) {
      expect(() => opencodeParseLine(event)).not.toThrow();
      expect(() => opencodeAdapter.onStreamLine("", event)).not.toThrow();
    }
    expect(opencodeParseLine({ type: "mystery" })).toEqual([]);
    expect(opencodeParseLine({})).toEqual([]);
  });
});
