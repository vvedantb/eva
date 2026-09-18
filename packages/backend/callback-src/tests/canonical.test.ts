import { test, expect } from "vitest";
import {
  parseToCanonical,
  applyCanonicalEvents,
  updateThinkingStep,
} from "../parse/canonical.js";
import { toolCallToStep } from "../parse/toolSteps.js";
import { buildStreamingPayload } from "../runtime/heartbeats.js";
import {
  callbackState as S,
  getPendingQuestionForTest,
  parsePriorStepForTest,
  resetStateForTests,
} from "../runtime/state.js";

test("parseToCanonical maps Claude tool_use to push_step", () => {
  resetStateForTests();
  const events = parseToCanonical(
    {
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            name: "Read",
            input: { file_path: "/tmp/repo/src/index.ts" },
          },
        ],
      },
    },
    "claude",
  );
  expect(events.length).toBe(1);
  expect(events[0].kind).toBe("push_step");
  if (events[0].kind === "push_step") {
    expect(events[0].step.type).toBe("read");
  }
});

test("applyCanonicalEvents sets pending question", () => {
  resetStateForTests();
  const changed = applyCanonicalEvents([
    { kind: "set_pending_question", data: '{"questions":[]}' },
  ]);
  expect(changed).toBe(true);
  expect(getPendingQuestionForTest()).toBe('{"questions":[]}');
});

test("Cursor assistant deltas concatenate without paragraph breaks", () => {
  resetStateForTests();
  for (const text of ["Wid", "ening", " the", " Sent to column."]) {
    applyCanonicalEvents(
      parseToCanonical(
        {
          type: "assistant",
          message: { content: [{ type: "text", text }] },
        },
        "cursor",
      ),
    );
  }
  expect(S.currentStreamedContent).toBe("Widening the Sent to column.");
  resetStateForTests();
});

test("tool_result clears in-flight tool by tool_use_id", () => {
  resetStateForTests();
  applyCanonicalEvents([
    {
      kind: "push_step",
      trackingId: "toolu_abc",
      step: {
        type: "bash",
        label: "Running command...",
        toolUseId: "toolu_abc",
        status: "active",
      },
    },
  ]);
  expect(S.inFlightToolUses).toBe(1);
  applyCanonicalEvents([{ kind: "complete_tool", trackingId: "toolu_abc" }]);
  expect(S.inFlightToolUses).toBe(0);
  resetStateForTests();
});

test("complete_tool merges result onto matching step", () => {
  resetStateForTests();
  applyCanonicalEvents([
    {
      kind: "push_step",
      trackingId: "toolu_out",
      step: {
        type: "bash",
        label: "Running command...",
        toolUseId: "toolu_out",
        command: "pwd",
        status: "active",
      },
    },
  ]);
  applyCanonicalEvents([
    {
      kind: "complete_tool",
      trackingId: "toolu_out",
      result: {
        output: { text: "/tmp/repo", exitCode: 0 },
        isError: false,
      },
    },
  ]);
  expect(S.accumulatedSteps[0]?.output?.text).toBe("/tmp/repo");
  expect(S.accumulatedSteps[0]?.output?.exitCode).toBe(0);
  expect(S.accumulatedSteps[0]?.status).toBe("complete");
  expect(typeof S.accumulatedSteps[0]?.durationMs).toBe("number");
  resetStateForTests();
});

test("codex item.started sets toolUseId for id-matched completion", () => {
  resetStateForTests();
  const events = parseToCanonical(
    {
      type: "item.started",
      item: {
        id: "item_xyz",
        type: "command_execution",
        command: "echo hi",
      },
    },
    "codex",
  );
  applyCanonicalEvents(events);
  expect(S.accumulatedSteps[0]?.toolUseId).toBe("item_xyz");
  applyCanonicalEvents(
    parseToCanonical(
      {
        type: "item.completed",
        item: {
          id: "item_xyz",
          type: "command_execution",
          aggregated_output: "hi\n",
          exit_code: 0,
        },
      },
      "codex",
    ),
  );
  expect(S.accumulatedSteps[0]?.status).toBe("complete");
  expect(S.accumulatedSteps[0]?.output?.text).toContain("hi");
  resetStateForTests();
});

test("append_text keeps distinct blocks separated and adds no activity steps", () => {
  resetStateForTests();
  // Each append_text is a whole (non-streamed) assistant text block, so distinct
  // blocks are separated by a paragraph break and never create activity steps.
  applyCanonicalEvents([{ kind: "append_text", text: "First reply." }]);
  applyCanonicalEvents([{ kind: "append_text", text: "Second reply." }]);
  expect(S.accumulatedSteps.length).toBe(0);
  expect(S.currentStreamedContent).toBe("First reply.\n\nSecond reply.");
  resetStateForTests();
});

test("append_text replaces streamed content on cumulative snapshots", () => {
  resetStateForTests();
  applyCanonicalEvents([{ kind: "append_text", text: "Hello" }]);
  applyCanonicalEvents([{ kind: "append_text", text: "Hello world" }]);
  expect(S.accumulatedSteps.length).toBe(0);
  expect(S.currentStreamedContent).toBe("Hello world");
  resetStateForTests();
});

test("update_reasoning opens one evolving reasoning step with prose in detail", () => {
  resetStateForTests();
  applyCanonicalEvents([{ kind: "update_reasoning", text: "pondering" }]);
  expect(S.accumulatedSteps.length).toBe(1);
  expect(S.accumulatedSteps[0]?.type).toBe("reasoning");
  expect(S.accumulatedSteps[0]?.label).toBe("Thinking...");
  expect(S.accumulatedSteps[0]?.status).toBe("active");
  expect(S.accumulatedSteps[0]?.detail).toBe("pondering");
  expect(S.lastStepType).toBe("thinking");
  resetStateForTests();
});

test("consecutive reasoning deltas coalesce into a single step", () => {
  resetStateForTests();
  for (const text of ["Read", "ing the ", "callback."]) {
    applyCanonicalEvents([{ kind: "update_reasoning", text }]);
  }
  expect(S.accumulatedSteps.length).toBe(1);
  expect(S.accumulatedSteps[0]?.detail).toBe("Reading the callback.");
  resetStateForTests();
});

test("a growing reasoning snapshot supersedes rather than concatenating", () => {
  resetStateForTests();
  applyCanonicalEvents([{ kind: "update_reasoning", text: "Step one" }]);
  applyCanonicalEvents([
    { kind: "update_reasoning", text: "Step one, step two" },
  ]);
  expect(S.accumulatedSteps.length).toBe(1);
  expect(S.accumulatedSteps[0]?.detail).toBe("Step one, step two");
  resetStateForTests();
});

test("a tool call between reasoning bursts opens a second reasoning step", () => {
  resetStateForTests();
  applyCanonicalEvents([{ kind: "update_reasoning", text: "first burst" }]);
  applyCanonicalEvents([
    {
      kind: "push_step",
      trackingId: "toolu_r",
      step: {
        type: "bash",
        label: "Running command...",
        toolUseId: "toolu_r",
        status: "active",
      },
    },
  ]);
  applyCanonicalEvents([{ kind: "complete_tool", trackingId: "toolu_r" }]);
  applyCanonicalEvents([{ kind: "update_reasoning", text: "second burst" }]);
  const reasoning = S.accumulatedSteps.filter((s) => s.type === "reasoning");
  expect(reasoning.length).toBe(2);
  expect(reasoning[0]?.status).toBe("complete");
  expect(reasoning[0]?.label).toBe("Thought");
  expect(reasoning[0]?.detail).toBe("first burst");
  expect(reasoning[1]?.status).toBe("active");
  expect(reasoning[1]?.detail).toBe("second burst");
  resetStateForTests();
});

test("reasoning prose is head-capped so one burst cannot dominate the payload", () => {
  resetStateForTests();
  applyCanonicalEvents([
    { kind: "update_reasoning", text: "x".repeat(10_000) },
  ]);
  expect(S.accumulatedSteps[0]?.detail?.length).toBe(6000);
  resetStateForTests();
});

test("thinking push_step is transient and does not add activity steps", () => {
  resetStateForTests();
  applyCanonicalEvents([
    {
      kind: "push_step",
      step: {
        type: "thinking",
        label: "Finalizing response...",
        status: "active",
      },
    },
  ]);
  expect(S.accumulatedSteps.length).toBe(0);
  expect(JSON.parse(buildStreamingPayload())).toEqual([
    {
      type: "thinking",
      label: "Finalizing response...",
      status: "active",
    },
  ]);
  expect(S.lastStepType).toBe("thinking");
  resetStateForTests();
});

test("real activity replaces the transient thinking heartbeat", () => {
  resetStateForTests();
  updateThinkingStep("Waiting for Grok...", "The model is thinking...");
  expect(JSON.parse(buildStreamingPayload())).toEqual([
    {
      type: "thinking",
      label: "Waiting for Grok...",
      detail: "The model is thinking...",
      status: "active",
    },
  ]);

  applyCanonicalEvents([{ kind: "update_reasoning", text: "Inspecting code" }]);
  expect(S.transientThinkingStep).toBeNull();
  expect(JSON.parse(buildStreamingPayload())).toEqual([
    {
      type: "reasoning",
      label: "Thinking...",
      detail: "Inspecting code",
      status: "active",
    },
  ]);
  resetStateForTests();
});

test("parsePriorStepForTest ignores transient activity rows", () => {
  expect(
    parsePriorStepForTest({
      type: "thinking",
      label: "Preparing Codex session...",
      status: "active",
    }),
  ).toBe(null);
  expect(
    parsePriorStepForTest({
      type: "reasoning",
      label: "Thinking...",
      status: "active",
    }),
  ).toBe(null);
  expect(
    parsePriorStepForTest({
      type: "response",
      label: "Streaming response...",
      status: "active",
    }),
  ).toBe(null);
});

test("parseToCanonical codex reasoning item routes to update_reasoning", () => {
  resetStateForTests();
  const started = parseToCanonical(
    {
      type: "item.started",
      item: { id: "item_0", type: "reasoning" },
    },
    "codex",
  );
  expect(started.length).toBe(0);
  const completed = parseToCanonical(
    {
      type: "item.completed",
      item: { id: "item_0", type: "reasoning", text: "**Exploring repo**" },
    },
    "codex",
  );
  expect(completed.length).toBe(1);
  expect(completed[0]).toEqual({
    kind: "update_reasoning",
    text: "**Exploring repo**",
  });
});

test("parseToCanonical opencode reasoning part routes to update_reasoning", () => {
  const events = parseToCanonical(
    { type: "reasoning", part: { text: "weighing options" } },
    "opencode",
  );
  expect(events.length).toBe(1);
  expect(events[0]).toEqual({
    kind: "update_reasoning",
    text: "weighing options",
  });
});

test("parseToCanonical cursor thinking event routes to update_reasoning", () => {
  resetStateForTests();
  const events = parseToCanonical(
    { type: "thinking", text: "hmm let me see" },
    "cursor",
  );
  expect(events.length).toBe(1);
  expect(events[0]).toEqual({
    kind: "update_reasoning",
    text: "hmm let me see",
  });
});

test("parseToCanonical claude thinking_delta routes to update_reasoning", () => {
  resetStateForTests();
  const events = parseToCanonical(
    {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "thinking_delta", thinking: "Weighing the two fixes." },
      },
    },
    "claude",
  );
  expect(events).toEqual([
    { kind: "update_reasoning", text: "Weighing the two fixes." },
  ]);
});

// With `thinking.display` omitted, current models stream thinking blocks with
// empty text — nothing must reach the reasoning step (claudeSdk.ts asks for
// summaries explicitly so real text arrives instead).
test("parseToCanonical claude empty thinking_delta emits nothing", () => {
  resetStateForTests();
  const events = parseToCanonical(
    {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "thinking_delta", thinking: "" },
      },
    },
    "claude",
  );
  expect(events).toEqual([]);
});

// Regression tests for the interleaved-thinking paragraph-break fix. With
// interleaved thinking the model streams text → thinking → text inside one
// message; consecutive text blocks used to clump ("design.Design settled.").
// A paragraph break must land between distinct blocks/messages, but never
// between deltas of the same block nor as a leading break on an empty buffer.

test("interleaved thinking inserts a paragraph break between text blocks in one message", () => {
  resetStateForTests();
  applyCanonicalEvents([
    { kind: "mark_message_start" },
    { kind: "mark_text_block_start" },
    { kind: "stream_text_delta", text: "First para." },
    { kind: "update_reasoning", text: "pondering" },
    { kind: "mark_text_block_start" },
    { kind: "stream_text_delta", text: "Second para." },
  ]);
  expect(S.currentStreamedContent).toBe("First para.\n\nSecond para.");
  resetStateForTests();
});

test("deltas within one text block are not separated by a paragraph break", () => {
  resetStateForTests();
  applyCanonicalEvents([
    { kind: "mark_message_start" },
    { kind: "stream_text_delta", text: "Hello" },
    { kind: "stream_text_delta", text: " world" },
  ]);
  expect(S.currentStreamedContent).toBe("Hello world");
  resetStateForTests();
});

test("a new assistant message inserts a paragraph break before its first text", () => {
  resetStateForTests();
  applyCanonicalEvents([
    { kind: "mark_message_start" },
    { kind: "stream_text_delta", text: "Wrapping up the design." },
    { kind: "mark_message_start" },
    { kind: "stream_text_delta", text: "Design settled." },
  ]);
  expect(S.currentStreamedContent).toBe(
    "Wrapping up the design.\n\nDesign settled.",
  );
  resetStateForTests();
});

test("no leading paragraph break when the streamed buffer is empty", () => {
  resetStateForTests();
  applyCanonicalEvents([
    { kind: "mark_message_start" },
    { kind: "mark_text_block_start" },
    { kind: "stream_text_delta", text: "First line" },
  ]);
  expect(S.currentStreamedContent).toBe("First line");
  resetStateForTests();
});

test("an existing newline boundary is not doubled into a paragraph break", () => {
  resetStateForTests();
  // Trailing newline on the buffer: no extra break added.
  applyCanonicalEvents([{ kind: "append_text", text: "Line one\n" }]);
  applyCanonicalEvents([{ kind: "append_text", text: "Line two" }]);
  expect(S.currentStreamedContent).toBe("Line one\nLine two");
  // Leading newline on the next block: no extra break added.
  resetStateForTests();
  applyCanonicalEvents([{ kind: "append_text", text: "Line one" }]);
  applyCanonicalEvents([{ kind: "append_text", text: "\nLine two" }]);
  expect(S.currentStreamedContent).toBe("Line one\nLine two");
  resetStateForTests();
});

test("toolCallToStep captures AskUserQuestion questions and options", () => {
  const step = toolCallToStep("AskUserQuestion", {
    questions: [
      {
        question: "Which database?",
        header: "Storage",
        multiSelect: true,
        options: [
          { label: "Postgres", description: "Relational" },
          { label: "Convex" },
          { description: "no label — dropped" },
          "not an option",
        ],
      },
      { question: "", options: [] },
    ],
  });
  expect(step.type).toBe("question");
  expect(step.label).toBe("Asking a question...");
  expect(step.status).toBe("active");
  expect(step.detail).toBe("Which database?");
  expect(step.questions).toEqual([
    {
      question: "Which database?",
      header: "Storage",
      multiSelect: true,
      options: [
        { label: "Postgres", description: "Relational" },
        { label: "Convex", description: undefined },
      ],
    },
  ]);
});

test("toolCallToStep leaves AskUserQuestion questions unset when malformed", () => {
  const step = toolCallToStep("AskUserQuestion", { questions: "nope" });
  expect(step.type).toBe("question");
  expect(step.questions).toBe(undefined);
  expect(step.detail).toBe(undefined);
});

test("complete_tool merges AskUserQuestion answers onto the question step", () => {
  resetStateForTests();
  applyCanonicalEvents([
    {
      kind: "push_step",
      trackingId: "toolu_q",
      step: {
        type: "question",
        label: "Asking a question...",
        toolUseId: "toolu_q",
        questions: [{ question: "Which?", options: [{ label: "A" }] }],
        status: "active",
      },
    },
  ]);
  applyCanonicalEvents([
    {
      kind: "complete_tool",
      trackingId: "toolu_q",
      result: { answers: { "Which?": "A" } },
    },
  ]);
  const step = S.accumulatedSteps[S.accumulatedSteps.length - 1];
  expect(step.status).toBe("complete");
  expect(step.answers).toEqual({ "Which?": "A" });
  expect(step.questions).toEqual([
    { question: "Which?", options: [{ label: "A" }] },
  ]);
  resetStateForTests();
});

test("parsePriorStepForTest round-trips questions and answers", () => {
  const step = parsePriorStepForTest({
    type: "question",
    label: "Asked a question",
    status: "complete",
    questions: [
      {
        question: "Which database?",
        header: "Storage",
        options: [{ label: "Postgres" }, { bad: true }],
      },
      { options: [] },
    ],
    answers: { "Which database?": "Postgres", skipped: 3 },
  });
  expect(step).not.toBe(null);
  expect(step?.questions).toEqual([
    {
      question: "Which database?",
      header: "Storage",
      multiSelect: undefined,
      options: [{ label: "Postgres", description: undefined }],
    },
  ]);
  expect(step?.answers).toEqual({ "Which database?": "Postgres" });
});
