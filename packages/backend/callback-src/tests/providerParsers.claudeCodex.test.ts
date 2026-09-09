import { expect, test } from "vitest";
import { claudeParseLine } from "../providers/claude.js";
import { codexParseLine } from "../providers/codex.js";
import { callbackState as S, resetStateForTests } from "../runtime/state.js";
import type { JsonObject, JsonValue } from "../types.js";

/** Shapes a provider stream must never crash on, whatever the field types. */
const MALFORMED: JsonValue[] = [
  "",
  " ",
  0,
  1,
  true,
  false,
  null,
  [],
  [1, "two", null],
  Number.NaN,
  Number.POSITIVE_INFINITY,
  { nested: { deep: [1, { deeper: null }] } },
];

function malformedPayloads(types: readonly string[]): JsonObject[] {
  const keys = [
    "message",
    "content",
    "event",
    "delta",
    "item",
    "input",
    "tool_use_id",
    "id",
    "is_error",
    "text",
    "thinking",
    "todos",
    "status",
    "name",
  ];
  const payloads: JsonObject[] = [];
  for (const type of types) {
    payloads.push({ type });
    for (const key of keys) {
      for (const value of MALFORMED) {
        payloads.push({ type, [key]: value });
      }
    }
    for (const value of MALFORMED) {
      payloads.push({ type: "assistant", message: { content: [value] } });
      payloads.push({ type, item: { type: "command_execution", id: value } });
    }
  }
  for (const value of MALFORMED) {
    payloads.push({ type: value });
  }
  return payloads;
}

test("claudeParseLine never throws and never invents events", () => {
  resetStateForTests();
  const payloads = malformedPayloads([
    "assistant",
    "user",
    "tool_result",
    "stream_event",
    "result",
    "unknown_kind",
  ]);
  expect(payloads.length).toBeGreaterThan(400);
  for (const payload of payloads) {
    const events = claudeParseLine(payload);
    expect(Array.isArray(events)).toBe(true);
    for (const event of events) {
      expect(typeof event.kind).toBe("string");
    }
  }
});

test("claude tool_result trims the id, joins text blocks, and drops junk", () => {
  resetStateForTests();
  expect(
    claudeParseLine({
      type: "tool_result",
      tool_use_id: "  toolu_1  ",
      content: [
        "head",
        { type: "text", text: "-tail" },
        { type: "text", text: 5 },
        { type: "image", text: "skipped" },
        ["nested"],
        7,
      ],
      is_error: false,
    }),
  ).toEqual([
    {
      kind: "complete_tool",
      trackingId: "toolu_1",
      result: { output: { text: "head-tail", exitCode: undefined } },
    },
  ]);

  // A blank id is no id, a non-string content yields no text, and only the
  // boolean `true` marks an error — a truthy string does not.
  expect(
    claudeParseLine({
      type: "tool_result",
      tool_use_id: "   ",
      content: { text: "ignored" },
      is_error: "true",
    }),
  ).toEqual([{ kind: "complete_tool", trackingId: undefined }]);

  expect(claudeParseLine({ type: "tool_result", is_error: true })).toEqual([
    { kind: "complete_tool", trackingId: undefined, result: { isError: true } },
  ]);
});

test("claude user messages complete only tool_result blocks with an id", () => {
  resetStateForTests();
  expect(
    claudeParseLine({
      type: "user",
      message: {
        content: [
          "junk",
          { type: "tool_result", tool_use_id: "  " },
          { type: "tool_result" },
          { type: "text", text: "not a result" },
          { type: "tool_result", tool_use_id: " toolu_2 ", content: "done" },
        ],
      },
    }),
  ).toEqual([
    {
      kind: "complete_tool",
      trackingId: "toolu_2",
      result: { output: { text: "done", exitCode: undefined } },
    },
  ]);

  // No usable block: the user frame produces nothing at all.
  expect(
    claudeParseLine({
      type: "user",
      message: { content: [{ type: "tool_result" }] },
    }),
  ).toEqual([]);
  expect(claudeParseLine({ type: "user", message: "malformed" })).toEqual([]);
});

test("claude stream_event frames map deltas and ignore empty text", () => {
  resetStateForTests();
  const frame = (event: JsonValue): JsonObject => ({
    type: "stream_event",
    event,
  });
  expect(claudeParseLine(frame({ type: "message_start" }))).toEqual([
    { kind: "mark_message_start" },
  ]);
  expect(
    claudeParseLine(
      frame({ type: "content_block_start", content_block: { type: "text" } }),
    ),
  ).toEqual([{ kind: "mark_text_block_start" }]);
  // Only text blocks break the paragraph; thinking and malformed blocks do not.
  expect(
    claudeParseLine(
      frame({
        type: "content_block_start",
        content_block: { type: "thinking" },
      }),
    ),
  ).toEqual([]);
  expect(claudeParseLine(frame({ type: "content_block_start" }))).toEqual([]);
  expect(
    claudeParseLine(
      frame({
        type: "content_block_delta",
        delta: { type: "text_delta", text: " tok " },
      }),
    ),
  ).toEqual([{ kind: "stream_text_delta", text: " tok " }]);
  // An empty or non-string delta text is dropped, and never falls through to
  // the thinking arm even when a thinking field is present.
  expect(
    claudeParseLine(
      frame({
        type: "content_block_delta",
        delta: { type: "text_delta", text: "", thinking: "leak" },
      }),
    ),
  ).toEqual([]);
  expect(
    claudeParseLine(
      frame({
        type: "content_block_delta",
        delta: { type: "thinking_delta", thinking: "why" },
      }),
    ),
  ).toEqual([{ kind: "update_reasoning", text: "why" }]);
  expect(
    claudeParseLine(
      frame({ type: "content_block_delta", delta: ["not", "an", "object"] }),
    ),
  ).toEqual([]);
  expect(claudeParseLine(frame("not an object"))).toEqual([]);
});

test("claude assistant blocks are lenient field by field", () => {
  resetStateForTests();
  const events = claudeParseLine({
    type: "assistant",
    parent_tool_use_id: "  toolu_parent  ",
    message: {
      content: [
        { type: "tool_use", name: "Bash", id: "   ", input: { command: "ls" } },
        { type: "tool_use", name: "Read", id: " toolu_read ", input: "junk" },
        { type: "thinking", thinking: 42 },
        { type: "text", text: 7 },
        { type: "tool_use", name: 5, id: "toolu_x" },
      ],
    },
  });
  expect(events).toMatchObject([
    // A blank id leaves the step untracked, but the step is still pushed and
    // still nested under the subagent parent.
    {
      kind: "push_step",
      step: { type: "bash", parentToolUseId: "toolu_parent" },
    },
    {
      kind: "push_step",
      trackingId: "toolu_read",
      step: { type: "read", toolUseId: "toolu_read" },
    },
    // Non-string thinking/text payloads are coerced, not dropped.
    { kind: "update_reasoning", text: "42" },
    { kind: "append_text", text: "7" },
  ]);
  expect(events.length).toBe(4);
  expect(events[0].kind === "push_step" && events[0].step.toolUseId).toBe(
    undefined,
  );

  // Read-only todo tools add no row at all.
  expect(
    claudeParseLine({
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", name: "TodoRead", id: "t1" },
          { type: "tool_use", name: "ExitPlanMode", id: "t2" },
        ],
      },
    }),
  ).toEqual([]);

  // Text already streamed as deltas is not appended twice.
  S.streamedAssistantTextThisMessage = true;
  expect(
    claudeParseLine({
      type: "assistant",
      message: { content: [{ type: "text", text: "dup" }] },
    }),
  ).toEqual([]);
});

test("claude todo tools fold malformed checklists best-effort", () => {
  resetStateForTests();
  const todos = (input: JsonObject, name = "TodoWrite"): JsonValue => {
    const events = claudeParseLine({
      type: "assistant",
      message: { message: null, content: [{ type: "tool_use", name, input }] },
    });
    const first = events[0];
    return first && first.kind === "set_todos" ? first.todos : [];
  };

  expect(
    todos({
      todos: [
        { content: "one", status: "completed" },
        { content: "two", status: "bogus" },
        { content: "", status: "completed" },
        { content: 5 },
        "junk",
        ["junk"],
        { status: "in_progress" },
      ],
    }),
  ).toEqual([
    { content: "one", status: "completed" },
    { content: "two", status: "pending" },
  ]);

  // TaskCreate falls back to description, and an empty subject adds nothing.
  expect(todos({ subject: "", description: "desc" }, "TaskCreate")).toEqual([
    { content: "one", status: "completed" },
    { content: "two", status: "pending" },
  ]);
  expect(
    todos({ description: "third", status: "in_progress" }, "TaskCreate"),
  ).toEqual([
    { content: "one", status: "completed" },
    { content: "two", status: "pending" },
    { content: "third", status: "in_progress" },
  ]);

  // TaskUpdate patches the last item; an unknown status resets it to pending
  // and a blank subject is ignored.
  expect(todos({ status: null, subject: "" }, "TaskUpdate")).toEqual([
    { content: "one", status: "completed" },
    { content: "two", status: "pending" },
    { content: "third", status: "pending" },
  ]);
  expect(todos({ subject: "renamed" }, "TaskUpdate")).toEqual([
    { content: "one", status: "completed" },
    { content: "two", status: "pending" },
    { content: "renamed", status: "pending" },
  ]);
  // A malformed TodoWrite payload clears the checklist, as it always has.
  expect(todos({ todos: "not an array" })).toEqual([]);
});

test("codexParseLine never throws and ignores unknown frames", () => {
  resetStateForTests();
  const payloads = malformedPayloads([
    "thread.started",
    "turn.started",
    "turn.completed",
    "item.started",
    "item.updated",
    "item.completed",
    "item.failed",
    "item.agent_message.delta",
    "item.reasoning.delta",
    "mystery.event",
  ]);
  expect(payloads.length).toBeGreaterThan(600);
  for (const payload of payloads) {
    expect(Array.isArray(codexParseLine(payload))).toBe(true);
  }
  expect(
    codexParseLine({ type: "mystery.event", item: { type: "x" } }),
  ).toEqual([]);
  expect(codexParseLine({ type: "thread.started" })).toEqual([]);
});

test("codex deltas keep whitespace and drop empty text", () => {
  resetStateForTests();
  expect(
    codexParseLine({ type: "item.agent_message.delta", delta: " tok" }),
  ).toEqual([{ kind: "stream_text_delta", text: " tok" }]);
  expect(
    codexParseLine({ type: "item.agent_message.delta", delta: "" }),
  ).toEqual([]);
  expect(
    codexParseLine({ type: "item.reasoning.delta", delta: " why " }),
  ).toEqual([{ kind: "update_reasoning", text: " why " }]);
  expect(codexParseLine({ type: "item.reasoning.delta", delta: 5 })).toEqual(
    [],
  );
});

test("codex reasoning items route text on any lifecycle frame", () => {
  resetStateForTests();
  for (const type of ["item.started", "item.updated", "item.completed"]) {
    expect(
      codexParseLine({ type, item: { type: "reasoning", text: " deep " } }),
    ).toEqual([{ kind: "update_reasoning", text: " deep " }]);
    // Blank reasoning text is not a step and not a reasoning update.
    expect(
      codexParseLine({ type, item: { type: "reasoning", text: "   " } }),
    ).toEqual([]);
  }
});

test("codex item ids gate tracking differently on start and completion", () => {
  resetStateForTests();
  // A blank id cannot track a step, so the step is pushed untracked.
  expect(
    codexParseLine({
      type: "item.started",
      item: { type: "command_execution", id: "", command: "ls" },
    }),
  ).toMatchObject([{ kind: "push_step", step: { type: "bash" } }]);
  expect(
    codexParseLine({
      type: "item.started",
      item: { type: "command_execution", id: "item_1", command: "ls" },
    }),
  ).toMatchObject([{ kind: "push_step", trackingId: "item_1" }]);

  // On completion an id of any length still names the step to complete.
  expect(
    codexParseLine({
      type: "item.completed",
      item: { type: "command_execution", id: "", output: "done" },
    }),
  ).toMatchObject([{ kind: "complete_tool", trackingId: "" }]);
  // Without an id there is nothing to name: a bare result, else a plain mark.
  expect(
    codexParseLine({
      type: "item.completed",
      item: { type: "command_execution" },
    }),
  ).toEqual([{ kind: "mark_last_complete" }]);
  expect(
    codexParseLine({
      type: "item.failed",
      item: { type: "command_execution" },
    }),
  ).toMatchObject([{ kind: "complete_tool", result: { isError: true } }]);
});
