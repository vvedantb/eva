import { Option, Schema } from "effect";
import { NonEmptyText, Text, lenient } from "../parse/schemaHelpers.js";
import { cursorSdkToolToStep } from "../parse/toolSteps.js";
import {
  buildStepOutput,
  probeToolCompleteResult,
  readObject,
} from "../parse/toolResultCapture.js";
import {
  syncCursorStateToPersist,
  writeCursorSessionState,
} from "../session/cursorSession.js";
import { callbackState as S } from "../runtime/state.js";
import type {
  CanonicalEvent,
  JsonObject,
  JsonValue,
  StreamLineResult,
  ToolCompleteResult,
} from "../types.js";
import { log } from "../utils.js";
import type { ProviderAdapter } from "./types.js";

/** A key that is present and carries a value, as opposed to being absent. */
const PresentValue = Schema.Unknown.pipe(
  Schema.filter((value) => value !== undefined),
);

/** The `type` every Cursor stream event is dispatched on. */
const CursorEnvelope = Schema.Struct({
  type: Schema.optional(lenient(Schema.String)),
});

/** A tool result enveloped as `{status:"success", value}`. */
const SuccessEnvelope = Schema.Struct({
  status: Schema.Literal("success"),
  value: PresentValue,
});

/** A tool result enveloped as `{status:"error", error}`. */
const ErrorEnvelope = Schema.Struct({
  status: Schema.Literal("error"),
  error: PresentValue,
});

/**
 * A failed tool's `{message}` payload. The trim is harmless: the message only
 * reaches `buildStepOutput`, which trims what it caps.
 */
const ErrorMessagePayload = Schema.Struct({ message: Text });

/**
 * A successful tool's value payload: `diffString` for edits, `executionTime`
 * for shell. Both are lenient so a malformed diff cannot lose the duration.
 */
const ValuePayload = Schema.Struct({
  diffString: Schema.optional(lenient(Text)),
  executionTime: Schema.optional(lenient(Schema.Finite)),
});

/**
 * An assistant message's text blocks. `text` is accepted empty here — the
 * stream-line hook only asks whether a text block arrived at all, and the
 * parser drops the empty ones itself. `tool_use` blocks decode to nothing:
 * tool lifecycle comes from `tool_call` events.
 */
const AssistantTextBlock = Schema.Struct({
  type: Schema.Literal("text"),
  text: Schema.String,
});

const AssistantMessage = Schema.Struct({
  message: Schema.optional(
    lenient(
      Schema.Struct({
        content: Schema.optional(
          lenient(Schema.Array(lenient(AssistantTextBlock))),
        ),
      }),
    ),
  ),
});

/** A `thinking` event, whose text reaches the feed unmodified. */
const ThinkingEvent = Schema.Struct({ text: NonEmptyText });

/**
 * A `tool_call` event's identity fields. `args` stays a raw JsonObject: it is
 * freeform tool input, read key by key inside `cursorSdkToolToStep`.
 */
const ToolCall = Schema.Struct({
  call_id: Schema.optional(lenient(Text)),
  status: Schema.optional(lenient(Schema.String)),
  name: Schema.optional(lenient(Schema.String)),
});

/** A `system` event's agent id, as persisted by the session store. */
const SystemAgentId = Schema.Struct({ agent_id: Text });

const decodeEnvelope = Schema.decodeUnknownOption(CursorEnvelope);
const decodeSuccessEnvelope = Schema.decodeUnknownOption(SuccessEnvelope);
const decodeErrorEnvelope = Schema.decodeUnknownOption(ErrorEnvelope);
const decodeErrorMessagePayload =
  Schema.decodeUnknownOption(ErrorMessagePayload);
const decodeValuePayload = Schema.decodeUnknownOption(ValuePayload);
const decodeAssistantMessage = Schema.decodeUnknownOption(AssistantMessage);
const decodeThinkingEvent = Schema.decodeUnknownOption(ThinkingEvent);
const decodeToolCall = Schema.decodeUnknownOption(ToolCall);
const decodeSystemAgentId = Schema.decodeUnknownOption(SystemAgentId);

/** Shapes whose every field is optional, so an object payload always decodes. */
type ValueFields = Schema.Schema.Type<typeof ValuePayload>;
type AssistantFields = Schema.Schema.Type<typeof AssistantMessage>;
type ToolCallFields = Schema.Schema.Type<typeof ToolCall>;

/** The event type, or `undefined` when the field is missing or not a string. */
function readEventType(event: JsonObject): string | undefined {
  return Option.getOrUndefined(decodeEnvelope(event))?.type;
}

/** Every text block of an assistant message, in order, empty ones included. */
function readAssistantTexts(event: JsonObject): string[] {
  const fields = Option.getOrElse(
    decodeAssistantMessage(event),
    (): AssistantFields => ({}),
  );
  const texts: string[] = [];
  for (const block of fields.message?.content ?? []) {
    if (block !== undefined) texts.push(block.text);
  }
  return texts;
}

/**
 * Unwraps a Cursor SDK tool result. Results arrive enveloped as
 * `{status:"success", value} | {status:"error", error}` (e.g. shell value
 * `{exitCode, stdout, stderr, executionTime}`, edit value `{diffString}`);
 * plain payloads fall through to the shared multi-key probe.
 */
export function probeCursorSdkToolResult(
  status: string,
  result: JsonValue | undefined,
): ToolCompleteResult | undefined {
  const eventIsError = status === "error";
  if (result === undefined || result === null) {
    return eventIsError ? { isError: true } : undefined;
  }

  let payload: JsonValue = result;
  let envelopeIsError = false;
  if (typeof result === "object" && !Array.isArray(result)) {
    if (Option.isSome(decodeSuccessEnvelope(result))) {
      payload = result.value;
    } else if (Option.isSome(decodeErrorEnvelope(result))) {
      payload = result.error;
      envelopeIsError = true;
    }
  }
  const isError = eventIsError || envelopeIsError;

  // Error payloads can be a bare message string or `{message}`.
  if (typeof payload === "string") {
    const output = buildStepOutput(payload);
    if (!output && !isError) return undefined;
    return { output, isError: isError ? true : undefined };
  }
  if (isError) {
    const named = decodeErrorMessagePayload(payload);
    if (Option.isSome(named)) {
      return {
        output: buildStepOutput(named.value.message),
        isError: true,
      };
    }
  }

  const probed = probeToolCompleteResult(payload) ?? {};
  const value = Option.getOrElse(
    decodeValuePayload(payload),
    (): ValueFields => ({}),
  );
  if (!probed.output && value.diffString) {
    probed.output = buildStepOutput(value.diffString);
  }
  if (value.executionTime !== undefined) {
    probed.durationMs = value.executionTime;
  }

  if (isError) probed.isError = true;
  if (
    !probed.output &&
    probed.isError === undefined &&
    !probed.files &&
    probed.durationMs === undefined
  ) {
    return undefined;
  }
  return probed;
}

/**
 * Maps a Cursor SDK `tool_call` event (status "running" | "completed" |
 * "error", stable `call_id`) to push/complete canonical events. Duplicate
 * transitions are dropped via the per-attempt id sets; a terminal event whose
 * `running` was never seen pushes then completes so no tool goes missing.
 */
function cursorToolCallEvents(event: JsonObject): CanonicalEvent[] {
  const fields = Option.getOrElse(
    decodeToolCall(event),
    (): ToolCallFields => ({}),
  );
  const callId = fields.call_id;
  const status = fields.status ?? "";
  const name = fields.name ?? "";
  const args = readObject(event, ["args"]) ?? {};

  if (status === "running") {
    if (
      callId &&
      (S.cursorKnownToolIds.has(callId) || S.cursorTerminalToolIds.has(callId))
    ) {
      return [];
    }
    const step = cursorSdkToolToStep(name, args);
    if (callId) {
      step.toolUseId = callId;
      S.cursorKnownToolIds.add(callId);
      return [{ kind: "push_step", step, trackingId: callId }];
    }
    return [{ kind: "push_step", step }];
  }

  if (status === "completed" || status === "error") {
    const events: CanonicalEvent[] = [];
    if (callId) {
      if (S.cursorTerminalToolIds.has(callId)) return [];
      if (!S.cursorKnownToolIds.has(callId)) {
        const step = cursorSdkToolToStep(name, args);
        step.toolUseId = callId;
        S.cursorKnownToolIds.add(callId);
        events.push({ kind: "push_step", step, trackingId: callId });
      }
      S.cursorTerminalToolIds.add(callId);
    }
    const result = probeCursorSdkToolResult(status, event.result);
    events.push(
      result
        ? { kind: "complete_tool", trackingId: callId, result }
        : { kind: "complete_tool", trackingId: callId },
    );
    return events;
  }

  return [];
}

/**
 * Classifies the SDK's in-place compaction lifecycle events. The runner treats
 * an open compaction as liveness (a compacting agent must never be timed out
 * and replaced), and the parser surfaces it in the activity feed.
 */
export function cursorCompactionEventPhase(
  type: string,
): "started" | "completed" | null {
  if (type === "summary-started" || type === "summary_started") {
    return "started";
  }
  if (type === "summary-completed" || type === "summary_completed") {
    return "completed";
  }
  return null;
}

/**
 * Stream event types that legitimately carry nothing the activity feed wants.
 * Producing no canonical events for these is expected, not a parser gap.
 */
const SILENT_EVENT_TYPES = new Set([
  "user",
  "status",
  "request",
  "task",
  "usage",
]);

/** Event types already reported: one log line each, not one per stream event. */
const reportedSilentTypes = new Set<string>();

/**
 * Parses one Cursor SDK stream event (serialized by runCursorSdkAttempt) into
 * canonical events. The final `result` line is synthesized by the runner from
 * run.wait().
 *
 * An event that yields nothing is reported once per type. The two failure modes
 * that matter are invisible otherwise: a turn whose whole stream is dropped
 * still returns a correct answer via run.wait(), so an SDK whose message shapes
 * have drifted from this parser reads as a silent hang rather than a bug.
 */
export function cursorParseLine(event: JsonObject): CanonicalEvent[] {
  const events = cursorEventToCanonical(event);
  if (events.length === 0) {
    const type = readEventType(event) ?? "(untyped)";
    if (!SILENT_EVENT_TYPES.has(type) && !reportedSilentTypes.has(type)) {
      reportedSilentTypes.add(type);
      log(
        "cursor stream event '" +
          type +
          "' produced no activity steps; parser and SDK may disagree on its shape",
      );
    }
  }
  return events;
}

function cursorEventToCanonical(event: JsonObject): CanonicalEvent[] {
  const events: CanonicalEvent[] = [];
  const type = readEventType(event);
  if (type === "system") {
    events.push({
      kind: "update_thinking",
      label: "Cursor agent ready",
      detail: "Model context initialized.",
    });
    return events;
  }
  if (type === "assistant") {
    for (const text of readAssistantTexts(event)) {
      // The Cursor SDK emits one assistant event per text delta. Treating
      // each event as a complete block inserts a Markdown paragraph between
      // token fragments in the shared canonical assembler.
      if (text) events.push({ kind: "stream_text_delta", text });
    }
    return events;
  }
  if (type === "thinking") {
    const thinking = decodeThinkingEvent(event);
    if (Option.isSome(thinking)) {
      events.push({ kind: "update_reasoning", text: thinking.value.text });
    }
    return events;
  }
  if (type === "tool_call") {
    return cursorToolCallEvents(event);
  }
  if (type === "result") {
    events.push({ kind: "mark_last_complete" });
    return events;
  }
  if (type !== undefined) {
    const compactionPhase = cursorCompactionEventPhase(type);
    if (compactionPhase === "started") {
      events.push({
        kind: "update_thinking",
        label: "Compacting context...",
        detail: "Cursor is summarizing the conversation in place.",
      });
      return events;
    }
    if (compactionPhase === "completed") {
      events.push({
        kind: "update_thinking",
        label: "Context compacted",
        detail: "The agent continues with its history summarized in place.",
      });
      return events;
    }
  }
  return events;
}

function onStreamLine(parsed: JsonObject): StreamLineResult {
  const type = readEventType(parsed);
  // Belt-and-braces session capture — the runner persists agent.agentId right
  // after create/resume; this keeps the id fresh if the SDK ever rotates it.
  if (type === "system") {
    const system = decodeSystemAgentId(parsed);
    if (Option.isSome(system)) {
      const agentId = system.value.agent_id;
      if (agentId !== S.activeCursorSessionId) {
        S.activeCursorSessionId = agentId;
        writeCursorSessionState();
        return { needsHeartbeat: true };
      }
    }
    return {};
  }
  if (type === "assistant") {
    if (S.firstAssistantEventAt === 0) S.firstAssistantEventAt = Date.now();
    if (S.firstTextBlockAt === 0 && readAssistantTexts(parsed).length > 0) {
      S.firstTextBlockAt = Date.now();
    }
    return {};
  }
  if (type === "tool_call") {
    S.firstTextBlockAt = 0;
    return {};
  }
  if (type === "result" && !S.resultEventSeen) {
    S.resultEventSeen = true;
    syncCursorStateToPersist();
  }
  return {};
}

export const cursorAdapter: ProviderAdapter = {
  parseLine: cursorParseLine,
  onStreamLine(_line: string, parsed: JsonObject): StreamLineResult {
    return onStreamLine(parsed);
  },
};
