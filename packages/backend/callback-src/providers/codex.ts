import { Option, Schema } from "effect";
import { NonEmptyText } from "../parse/schemaHelpers.js";
import {
  codexItemToStep,
  getCodexAgentMessageText,
  getCodexThreadId,
} from "../parse/toolSteps.js";
import {
  probeCodexItemResult,
  readNonBlankString,
  readNonEmptyString,
  readObject,
  readString,
} from "../parse/toolResultCapture.js";
import {
  syncCodexStateToPersist,
  writeCodexSessionState,
} from "../session/codexSession.js";
import { callbackState as S } from "../runtime/state.js";
import type { CanonicalEvent, JsonObject, StreamLineResult } from "../types.js";
import type { ProviderAdapter } from "./types.js";

/** Streaming frames: the delta is appended as written and must carry text. */
const AgentMessageDeltaFrame = Schema.Struct({
  type: Schema.Literal("item.agent_message.delta"),
  delta: NonEmptyText,
});
const ReasoningDeltaFrame = Schema.Struct({
  type: Schema.Literal("item.reasoning.delta"),
  delta: NonEmptyText,
});

/** An `agent_message` item (`agentMessage` in the App Server casing). */
const AgentMessageItem = Schema.Struct({
  type: Schema.Literal("agent_message", "agentMessage"),
});

/** A `reasoning` item — it carries thinking text rather than a tool step. */
const ReasoningItem = Schema.Struct({ type: Schema.Literal("reasoning") });

/** Any other typed item; these map to tool steps. */
const ToolItem = Schema.Struct({
  type: Schema.String.pipe(
    Schema.filter(
      (type) => type !== "agent_message" && type !== "agentMessage",
    ),
  ),
});

const decodeAgentMessageDelta = Schema.decodeUnknownOption(
  AgentMessageDeltaFrame,
);
const decodeReasoningDelta = Schema.decodeUnknownOption(ReasoningDeltaFrame);
const decodeAgentMessageItem = Schema.decodeUnknownOption(AgentMessageItem);
const decodeReasoningItem = Schema.decodeUnknownOption(ReasoningItem);
const decodeToolItem = Schema.decodeUnknownOption(ToolItem);

export function codexParseLine(event: JsonObject): CanonicalEvent[] {
  const events: CanonicalEvent[] = [];
  const threadId = getCodexThreadId(event);
  if (event.type === "thread.started" && threadId) {
    events.push({ kind: "set_codex_thread", threadId });
    events.push({
      kind: "update_thinking",
      label: "Starting Codex SDK...",
      detail: "Restoring saved context...",
    });
    return events;
  }
  if (event.type === "turn.started") {
    events.push({
      kind: "update_thinking",
      label: "Starting Codex SDK...",
      detail: "Codex is reasoning...",
    });
    return events;
  }
  const agentDelta = decodeAgentMessageDelta(event);
  if (Option.isSome(agentDelta)) {
    events.push({ kind: "stream_text_delta", text: agentDelta.value.delta });
    return events;
  }
  const reasoningDelta = decodeReasoningDelta(event);
  if (Option.isSome(reasoningDelta)) {
    events.push({
      kind: "update_reasoning",
      text: reasoningDelta.value.delta,
    });
    return events;
  }
  const item = readObject(event, ["item"]);
  if (
    event.type === "item.started" &&
    item &&
    Option.isSome(decodeAgentMessageItem(item))
  ) {
    events.push({ kind: "mark_message_start" });
    return events;
  }
  // Reasoning items carry the model's actual thinking text. Skip on start
  // (no tool step) and route the text on completion; without this they'd be
  // misclassified as a generic "Using reasoning..." tool step.
  if (
    (event.type === "item.started" ||
      event.type === "item.updated" ||
      event.type === "item.completed") &&
    item &&
    Option.isSome(decodeReasoningItem(item))
  ) {
    const text = readNonBlankString(item, ["text"]);
    if (text !== undefined) {
      events.push({ kind: "update_reasoning", text });
    }
    return events;
  }
  if (
    event.type === "item.started" &&
    item &&
    Option.isSome(decodeToolItem(item))
  ) {
    const step = codexItemToStep(item);
    const trackingId =
      step.type !== "thinking" ? readNonEmptyString(item, ["id"]) : undefined;
    events.push(
      trackingId
        ? { kind: "push_step", step, trackingId }
        : { kind: "push_step", step },
    );
    return events;
  }
  if (
    event.type === "item.completed" &&
    item &&
    Option.isSome(decodeAgentMessageItem(item))
  ) {
    const messageText = getCodexAgentMessageText(item);
    if (messageText && !S.streamedAssistantTextThisMessage) {
      events.push({ kind: "append_text", text: messageText });
    }
    return events;
  }
  if (
    (event.type === "item.completed" || event.type === "item.failed") &&
    item &&
    Option.isSome(decodeToolItem(item))
  ) {
    const result = probeCodexItemResult(item, event.type === "item.failed");
    // An id of any length identifies the step here (even an empty one), unlike
    // the push path above where a blank id leaves the step untracked.
    const trackingId = readString(item, ["id"]);
    if (trackingId !== undefined) {
      events.push(
        result
          ? { kind: "complete_tool", trackingId, result }
          : { kind: "complete_tool", trackingId },
      );
    } else if (result) {
      events.push({ kind: "complete_tool", result });
    } else {
      events.push({ kind: "mark_last_complete" });
    }
    return events;
  }
  if (event.type === "turn.completed") {
    events.push({ kind: "mark_last_complete" });
    return events;
  }
  return events;
}

function onStreamLine(parsed: JsonObject): StreamLineResult {
  const threadId = getCodexThreadId(parsed);
  if (parsed.type === "thread.started" && threadId) {
    S.activeCodexThreadId = threadId;
    writeCodexSessionState();
    return {};
  }
  if (parsed.type === "turn.completed" && !S.resultEventSeen) {
    S.resultEventSeen = true;
    syncCodexStateToPersist();
  }
  return {};
}

export const codexAdapter: ProviderAdapter = {
  parseLine: codexParseLine,
  onStreamLine(_line: string, parsed: JsonObject): StreamLineResult {
    return onStreamLine(parsed);
  },
};
