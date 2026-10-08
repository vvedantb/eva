import { cursorSdkToolToStep } from "../parse/toolSteps.js";
import {
  buildStepOutput,
  probeToolCompleteResult,
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
    const envStatus = typeof result.status === "string" ? result.status : "";
    if (envStatus === "success" && result.value !== undefined) {
      payload = result.value;
    } else if (envStatus === "error" && result.error !== undefined) {
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
  if (
    isError &&
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    typeof payload.message === "string" &&
    payload.message.trim()
  ) {
    return {
      output: buildStepOutput(payload.message),
      isError: true,
    };
  }

  const probed = probeToolCompleteResult(payload) ?? {};
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload)
  ) {
    if (
      !probed.output &&
      typeof payload.diffString === "string" &&
      payload.diffString.trim()
    ) {
      probed.output = buildStepOutput(payload.diffString);
    }
    if (
      typeof payload.executionTime === "number" &&
      Number.isFinite(payload.executionTime)
    ) {
      probed.durationMs = payload.executionTime;
    }
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
  const callId =
    typeof event.call_id === "string" && event.call_id.trim()
      ? event.call_id.trim()
      : undefined;
  const status = typeof event.status === "string" ? event.status : "";
  const name = typeof event.name === "string" ? event.name : "";
  const args =
    event.args && typeof event.args === "object" && !Array.isArray(event.args)
      ? event.args
      : {};

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
    const type = typeof event.type === "string" ? event.type : "(untyped)";
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
  if (event.type === "system") {
    events.push({
      kind: "update_thinking",
      label: "Cursor agent ready",
      detail: "Model context initialized.",
    });
    return events;
  }
  if (event.type === "assistant") {
    const message =
      event.message &&
      typeof event.message === "object" &&
      !Array.isArray(event.message)
        ? event.message
        : null;
    const contentBlocks =
      message && Array.isArray(message.content) ? message.content : [];
    for (const block of contentBlocks) {
      if (
        block &&
        typeof block === "object" &&
        !Array.isArray(block) &&
        block.type === "text" &&
        typeof block.text === "string" &&
        block.text
      ) {
        // The Cursor SDK emits one assistant event per text delta. Treating
        // each event as a complete block inserts a Markdown paragraph between
        // token fragments in the shared canonical assembler.
        events.push({ kind: "stream_text_delta", text: block.text });
      }
      // tool_use blocks are ignored — tool lifecycle comes from tool_call events.
    }
    return events;
  }
  if (
    event.type === "thinking" &&
    typeof event.text === "string" &&
    event.text
  ) {
    events.push({ kind: "update_reasoning", text: event.text });
    return events;
  }
  if (event.type === "tool_call") {
    return cursorToolCallEvents(event);
  }
  if (event.type === "result") {
    events.push({ kind: "mark_last_complete" });
    return events;
  }
  if (typeof event.type === "string") {
    const compactionPhase = cursorCompactionEventPhase(event.type);
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
  // Belt-and-braces session capture — the runner persists agent.agentId right
  // after create/resume; this keeps the id fresh if the SDK ever rotates it.
  if (
    parsed.type === "system" &&
    typeof parsed.agent_id === "string" &&
    parsed.agent_id.trim()
  ) {
    const agentId = parsed.agent_id.trim();
    if (agentId !== S.activeCursorSessionId) {
      S.activeCursorSessionId = agentId;
      writeCursorSessionState();
      return { needsHeartbeat: true };
    }
    return {};
  }
  if (parsed.type === "assistant") {
    if (S.firstAssistantEventAt === 0) S.firstAssistantEventAt = Date.now();
    const message =
      parsed.message &&
      typeof parsed.message === "object" &&
      !Array.isArray(parsed.message)
        ? parsed.message
        : null;
    const contentBlocks =
      message && Array.isArray(message.content) ? message.content : [];
    for (const block of contentBlocks) {
      if (
        block &&
        typeof block === "object" &&
        !Array.isArray(block) &&
        block.type === "text" &&
        typeof block.text === "string" &&
        S.firstTextBlockAt === 0
      ) {
        S.firstTextBlockAt = Date.now();
        break;
      }
    }
    return {};
  }
  if (parsed.type === "tool_call") {
    S.firstTextBlockAt = 0;
    return {};
  }
  if (parsed.type === "result" && !S.resultEventSeen) {
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
