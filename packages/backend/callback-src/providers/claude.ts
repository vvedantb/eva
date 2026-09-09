import { Option, Schema } from "effect";
import { BLOCKING_QUESTIONS_ENABLED } from "../config.js";
import {
  buildClaudeStartupStep,
  syncClaudeStateToPersist,
} from "../session/claudeSession.js";
import { updateThinkingStep } from "../parse/canonical.js";
import { toolCallToStep } from "../parse/toolSteps.js";
import { NonEmptyText, lenient } from "../parse/schemaHelpers.js";
import {
  buildStepOutput,
  readNonEmptyString,
  readObject,
  readString,
  readTrimmedString,
  readTrueFlag,
  TrimmedStringSchema,
} from "../parse/toolResultCapture.js";
import { callbackState as S } from "../runtime/state.js";
import {
  trackClaudeToolResult,
  trackClaudeToolUse,
} from "../runtime/backgroundShells.js";
import type {
  CanonicalEvent,
  JsonObject,
  JsonValue,
  StreamLineResult,
  TodoItem,
  ToolCompleteResult,
} from "../types.js";
import { elapsedAttemptMs, log } from "../utils.js";
import type { ProviderAdapter } from "./types.js";
import {
  parseClaudeSdkTaxonomy,
  consumesClaudeSdkTaxonomyMessage,
} from "../parse/sdkTaxonomy.js";

/** The fixed set a raw todo status is coerced to; anything else is "pending". */
const TodoStatus = Schema.Literal("in_progress", "completed");

/** A `text` block whose text is a real string. */
const TextContentBlock = Schema.Struct({
  type: Schema.Literal("text"),
  text: Schema.String,
});

/**
 * A `tool_result` content field: plain text, or blocks whose `text` parts are
 * concatenated. Entries of any other shape (numbers, nested arrays, text blocks
 * with a non-string `text`) drop out; a content field that is neither a string
 * nor an array yields no text at all.
 */
const ToolResultContent = Schema.transform(
  Schema.Union(
    Schema.String,
    Schema.Array(lenient(Schema.Union(Schema.String, TextContentBlock))),
  ),
  Schema.String,
  {
    strict: true,
    decode: (content) => {
      if (typeof content === "string") return content;
      let text = "";
      for (const part of content) {
        if (part === undefined) continue;
        text += typeof part === "string" ? part : part.text;
      }
      return text;
    },
    encode: (text) => text,
  },
);

/** A `tool_result` block inside a user message. */
const ToolResultBlock = Schema.Struct({
  type: Schema.Literal("tool_result"),
  tool_use_id: TrimmedStringSchema,
});

/** An assistant `tool_use` block. An empty `name` still reaches the tool map. */
const AssistantToolUseBlock = Schema.Struct({
  type: Schema.Literal("tool_use"),
  name: Schema.String,
});

/**
 * Thinking and text blocks coerce their payload with `String(...)`, so only the
 * block tag is validated here — the payload is read straight off the block.
 */
const AssistantThinkingBlock = Schema.Struct({
  type: Schema.Literal("thinking"),
});
const AssistantTextBlock = Schema.Struct({ type: Schema.Literal("text") });

/** One `TodoWrite` entry. An entry without content is dropped. */
const TodoEntry = Schema.Struct({
  content: NonEmptyText,
  status: Schema.optional(lenient(TodoStatus)),
});

/** Partial-message frames carried in `stream_event.event`. */
const MessageStartFrame = Schema.Struct({
  type: Schema.Literal("message_start"),
});
const ContentBlockStartFrame = Schema.Struct({
  type: Schema.Literal("content_block_start"),
});
const TextBlockStartFrame = Schema.Struct({
  type: Schema.Literal("content_block_start"),
  content_block: Schema.Struct({ type: Schema.Literal("text") }),
});
const TextDeltaFrame = Schema.Struct({
  type: Schema.Literal("content_block_delta"),
  delta: Schema.Struct({
    type: Schema.Literal("text_delta"),
    text: NonEmptyText,
  }),
});
const ThinkingDeltaFrame = Schema.Struct({
  type: Schema.Literal("content_block_delta"),
  delta: Schema.Struct({
    type: Schema.Literal("thinking_delta"),
    thinking: NonEmptyText,
  }),
});

/** `system:init` — the only frame that carries the resumable session id. */
const InitFrame = Schema.Struct({
  type: Schema.Literal("system"),
  subtype: Schema.Literal("init"),
  session_id: TrimmedStringSchema,
});

const decodeToolResultContent = Schema.decodeUnknownOption(ToolResultContent);
const decodeToolResultBlock = Schema.decodeUnknownOption(ToolResultBlock);
const decodeToolUseBlock = Schema.decodeUnknownOption(AssistantToolUseBlock);
const decodeThinkingBlock = Schema.decodeUnknownOption(AssistantThinkingBlock);
const decodeTextBlock = Schema.decodeUnknownOption(AssistantTextBlock);
const decodeTextContentBlock = Schema.decodeUnknownOption(TextContentBlock);
const decodeTodoEntry = Schema.decodeUnknownOption(TodoEntry);
const decodeTodoStatus = Schema.decodeUnknownOption(TodoStatus);
const decodeMessageStart = Schema.decodeUnknownOption(MessageStartFrame);
const decodeContentBlockStart = Schema.decodeUnknownOption(
  ContentBlockStartFrame,
);
const decodeTextBlockStart = Schema.decodeUnknownOption(TextBlockStartFrame);
const decodeTextDelta = Schema.decodeUnknownOption(TextDeltaFrame);
const decodeThinkingDelta = Schema.decodeUnknownOption(ThinkingDeltaFrame);
const decodeInitFrame = Schema.decodeUnknownOption(InitFrame);

/** Plain (non-array) JSON objects only — block arrays carry junk entries. */
function asJsonObject(value: JsonValue): JsonObject | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value;
}

/** The content blocks of a Claude message; empty when absent or malformed. */
function readContentBlocks(message: JsonObject | undefined): JsonValue[] {
  const content = message?.content;
  return Array.isArray(content) ? content : [];
}

function claudeToolCompleteResult(
  resultText: string,
  isError: boolean,
): ToolCompleteResult | undefined {
  const output = buildStepOutput(resultText);
  if (!output && !isError) {
    return undefined;
  }
  return {
    output,
    isError: isError ? true : undefined,
  };
}

/** Pull plain text out of a tool_result content field (string or text blocks). */
function readToolResultText(source: JsonObject): string {
  return Option.getOrElse(decodeToolResultContent(source.content), () => "");
}

/** Registers the result against the background-shell tracker and completes it. */
function completeToolEvent(
  toolUseId: string | undefined,
  resultText: string,
  isError: boolean,
): CanonicalEvent {
  if (toolUseId) {
    trackClaudeToolResult(toolUseId, resultText, isError);
  }
  const result = claudeToolCompleteResult(resultText, isError);
  return result
    ? { kind: "complete_tool", trackingId: toolUseId, result }
    : { kind: "complete_tool", trackingId: toolUseId };
}

/** Coerces a raw todo status field to the checklist's fixed set. */
function normalizeTodoStatus(value: JsonValue): TodoItem["status"] {
  return Option.getOrElse(decodeTodoStatus(value), () => "pending" as const);
}

/**
 * Folds one todo tool call into `S.todoState` and returns the current snapshot.
 * `TodoWrite` (the tool the sandbox CLI emits) sends the full list every call,
 * so it is a straight replace. `TaskCreate`/`TaskUpdate` (newer CLI Task tools)
 * are handled best-effort — create appends, update patches the last item — so a
 * CLI upgrade degrades gracefully rather than losing the checklist entirely.
 */
function reduceTodoState(name: string, input: JsonObject): TodoItem[] {
  if (name === "TodoWrite") {
    const raw = Array.isArray(input.todos) ? input.todos : [];
    S.todoState.length = 0;
    for (const item of raw) {
      const todo = decodeTodoEntry(item);
      if (Option.isNone(todo)) continue;
      S.todoState.push({
        content: todo.value.content,
        status: todo.value.status ?? "pending",
      });
    }
  } else if (name === "TaskCreate") {
    const content = readString(input, ["subject", "description"]) ?? "";
    if (content) {
      S.todoState.push({ content, status: normalizeTodoStatus(input.status) });
    }
  } else if (name === "TaskUpdate") {
    const last = S.todoState[S.todoState.length - 1];
    if (last) {
      if (input.status !== undefined)
        last.status = normalizeTodoStatus(input.status);
      const subject = readNonEmptyString(input, ["subject"]);
      if (subject !== undefined) {
        last.content = subject;
      }
    }
  }
  return S.todoState.map((t) => ({ ...t }));
}

/**
 * Handles Anthropic partial (`stream_event`) messages emitted when the SDK is
 * run with `includePartialMessages: true`. These carry token-level deltas:
 *   { type: "stream_event", event: { type: "content_block_delta",
 *       delta: { type: "text_delta", text: "..." } } }
 * plus lifecycle frames (message_start / content_block_start / _stop /
 * message_stop) and `thinking_delta`. We stream text_delta tokens live and map
 * thinking_delta to the existing reasoning liveness signal. Tool/json deltas
 * (input_json_delta) are ignored — the final assistant message still carries
 * the complete tool_use block.
 */
function parseClaudeStreamEvent(event: JsonObject): CanonicalEvent[] {
  const inner = readObject(event, ["event"]);
  if (!inner) return [];
  if (Option.isSome(decodeMessageStart(inner))) {
    return [{ kind: "mark_message_start" }];
  }
  if (Option.isSome(decodeContentBlockStart(inner))) {
    // A new text block opening mid-message (interleaved thinking emits
    // text → thinking → text with no message_start between) needs a paragraph
    // break so the blocks do not clump. Only text blocks — thinking/tool blocks
    // are not appended to the streamed content.
    return Option.isSome(decodeTextBlockStart(inner))
      ? [{ kind: "mark_text_block_start" }]
      : [];
  }
  const text = decodeTextDelta(inner);
  if (Option.isSome(text)) {
    return [{ kind: "stream_text_delta", text: text.value.delta.text }];
  }
  const thinking = decodeThinkingDelta(inner);
  if (Option.isSome(thinking)) {
    return [{ kind: "update_reasoning", text: thinking.value.delta.thinking }];
  }
  return [];
}

export function claudeParseLine(event: JsonObject): CanonicalEvent[] {
  if (consumesClaudeSdkTaxonomyMessage(event)) {
    return parseClaudeSdkTaxonomy(event);
  }
  const events: CanonicalEvent[] = [];
  if (event.type === "stream_event") {
    return parseClaudeStreamEvent(event);
  }
  if (event.type === "tool_result") {
    events.push(
      completeToolEvent(
        readTrimmedString(event, ["tool_use_id"]),
        readToolResultText(event),
        readTrueFlag(event, ["is_error"]),
      ),
    );
    return events;
  }
  if (event.type === "user") {
    for (const raw of readContentBlocks(readObject(event, ["message"]))) {
      const block = asJsonObject(raw);
      if (!block) continue;
      const resultBlock = decodeToolResultBlock(block);
      if (Option.isNone(resultBlock)) continue;
      events.push(
        completeToolEvent(
          resultBlock.value.tool_use_id,
          readToolResultText(block),
          readTrueFlag(block, ["is_error"]),
        ),
      );
    }
    if (events.length > 0) {
      return events;
    }
  }
  if (event.type !== "assistant") return events;

  if (S.waitingForFirstAssistantEvent) {
    events.push({ kind: "mark_first_assistant" });
  }
  // Set on messages produced INSIDE a subagent — the parent `Agent` tool_use id.
  // The UI nests these steps under the matching `subtask` row.
  const parentToolUseId = readTrimmedString(event, ["parent_tool_use_id"]);
  for (const raw of readContentBlocks(readObject(event, ["message"]))) {
    const block = asJsonObject(raw);
    if (!block) continue;
    const toolUse = decodeToolUseBlock(block);
    if (Option.isSome(toolUse)) {
      const name = toolUse.value.name;
      const input = readObject(block, ["input"]) ?? {};
      // Todo tools drive a single evolving checklist, not one activity row per
      // call. Read-only variants add nothing to the timeline.
      if (
        name === "TodoWrite" ||
        name === "TaskCreate" ||
        name === "TaskUpdate"
      ) {
        events.push({ kind: "set_todos", todos: reduceTodoState(name, input) });
        continue;
      }
      if (
        name === "TodoRead" ||
        name === "TaskGet" ||
        name === "TaskList" ||
        name === "ExitPlanMode"
      ) {
        continue;
      }
      const step = toolCallToStep(name, input);
      const trackingId = readTrimmedString(block, ["id"]);
      if (trackingId) {
        step.toolUseId = trackingId;
        trackClaudeToolUse(name, input, trackingId);
      }
      if (parentToolUseId) step.parentToolUseId = parentToolUseId;
      events.push(
        trackingId
          ? { kind: "push_step", step, trackingId }
          : { kind: "push_step", step },
      );
      // Fire-and-forget question metadata (surfaced after the turn). Skipped in
      // blocking mode, where canUseTool owns the question round-trip and driving
      // this too would double-render the question in the UI. Serialises the raw
      // input, not the narrowed object, so a non-object input travels as-is.
      if (
        !BLOCKING_QUESTIONS_ENABLED &&
        name === "AskUserQuestion" &&
        block.input
      ) {
        events.push({
          kind: "set_pending_question",
          data: JSON.stringify(block.input),
        });
      }
    } else if (Option.isSome(decodeThinkingBlock(block)) && block.thinking) {
      events.push({ kind: "update_reasoning", text: String(block.thinking) });
    } else if (Option.isSome(decodeTextBlock(block)) && block.text) {
      // Dedup: when text was already streamed live via text_delta partials
      // (flag set in applyCanonicalEvents), the final assistant message repeats
      // the same complete text — skip it to avoid doubling. When no deltas
      // streamed (flag false — non-partial path or other frames), append as the
      // fallback so text is never lost.
      if (!S.streamedAssistantTextThisMessage) {
        events.push({ kind: "append_text", text: String(block.text) });
      }
    }
  }
  return events;
}

function onStreamLine(parsed: JsonObject): StreamLineResult {
  const init = decodeInitFrame(parsed);
  if (Option.isSome(init)) {
    S.activeClaudeSessionId = init.value.session_id;
    S.claudeInitAt = Date.now();
    S.waitingForFirstAssistantEvent = true;
    log(
      "claude init event after " +
        String(elapsedAttemptMs()) +
        "ms sessionId=" +
        S.activeClaudeSessionId,
    );
    log("captured Claude session id " + S.activeClaudeSessionId);
    const startupStep = buildClaudeStartupStep();
    updateThinkingStep(startupStep.label, startupStep.detail);
    return { needsHeartbeat: true };
  }
  if (parsed.type === "assistant") {
    if (S.firstAssistantEventAt === 0) {
      S.firstAssistantEventAt = Date.now();
      log(
        "first assistant event after " +
          String(S.firstAssistantEventAt - S.activeAttemptStartedAt) +
          "ms",
      );
    }
    for (const raw of readContentBlocks(readObject(parsed, ["message"]))) {
      const block = decodeTextContentBlock(raw);
      if (Option.isNone(block)) continue;
      if (S.firstTextBlockAt === 0) {
        S.firstTextBlockAt = Date.now();
        log(
          "first text block after " +
            String(S.firstTextBlockAt - S.activeAttemptStartedAt) +
            "ms chars=" +
            String(block.value.text.length),
        );
      }
      break;
    }
    return {};
  }
  if (parsed.type === "result" && !S.resultEventSeen) {
    S.resultEventSeen = true;
    syncClaudeStateToPersist("result-event");
  }
  return {};
}

export const claudeAdapter: ProviderAdapter = {
  parseLine: claudeParseLine,
  onStreamLine(_line: string, parsed: JsonObject): StreamLineResult {
    return onStreamLine(parsed);
  },
};
