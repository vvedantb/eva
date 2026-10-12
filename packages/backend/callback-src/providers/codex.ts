import {
  codexItemToStep,
  getCodexAgentMessageText,
  getCodexThreadId,
} from "../parse/toolSteps.js";
import { probeCodexItemResult } from "../parse/toolResultCapture.js";
import {
  syncCodexStateToPersist,
  writeCodexSessionState,
} from "../session/codexSession.js";
import { callbackState as S } from "../runtime/state.js";
import type {
  CanonicalEvent,
  JsonObject,
  JsonValue,
  StreamLineResult,
} from "../types.js";
import type { ProviderAdapter } from "./types.js";

const isCodexAgentMessageType = (type: JsonValue | undefined): boolean =>
  type === "agent_message" || type === "agentMessage";

/** A non-empty string `delta`, or undefined. */
function nonEmptyDelta(event: JsonObject): string | undefined {
  return typeof event.delta === "string" && event.delta
    ? event.delta
    : undefined;
}

function codexStepEvent(item: JsonObject): CanonicalEvent {
  const step = codexItemToStep(item);
  const trackingId =
    step.type !== "thinking" && typeof item.id === "string"
      ? item.id
      : undefined;
  return trackingId
    ? { kind: "push_step", step, trackingId }
    : { kind: "push_step", step };
}

function codexToolCompleteEvent(
  item: JsonObject,
  failed: boolean,
): CanonicalEvent {
  const result = probeCodexItemResult(item, failed);
  if (typeof item.id === "string") {
    return result
      ? { kind: "complete_tool", trackingId: item.id, result }
      : { kind: "complete_tool", trackingId: item.id };
  }
  if (result) return { kind: "complete_tool", result };
  return { kind: "mark_last_complete" };
}

function codexItemEvents(type: JsonValue | undefined, item: JsonObject): CanonicalEvent[] {
  const isAgentMessage = isCodexAgentMessageType(item.type);
  if (type === "item.started" && isAgentMessage) {
    return [{ kind: "mark_message_start" }];
  }
  // Reasoning items carry the model's actual thinking text. Skip on start
  // (no tool step) and route the text on completion; without this they'd be
  // misclassified as a generic "Using reasoning..." tool step.
  if (item.type === "reasoning" && type !== "item.failed") {
    return typeof item.text === "string" && item.text.trim()
      ? [{ kind: "update_reasoning", text: item.text }]
      : [];
  }
  const isToolItem = typeof item.type === "string" && !isAgentMessage;
  if (type === "item.started" && isToolItem) {
    return [codexStepEvent(item)];
  }
  if (type === "item.completed" && isAgentMessage) {
    const messageText = getCodexAgentMessageText(item);
    return messageText && !S.streamedAssistantTextThisMessage
      ? [{ kind: "append_text", text: messageText }]
      : [];
  }
  if (type !== "item.updated" && isToolItem) {
    return [codexToolCompleteEvent(item, type === "item.failed")];
  }
  return [];
}

const CODEX_ITEM_EVENT_TYPES = new Set([
  "item.started",
  "item.updated",
  "item.completed",
  "item.failed",
]);

export function codexParseLine(event: JsonObject): CanonicalEvent[] {
  const threadId = getCodexThreadId(event);
  if (event.type === "thread.started" && threadId) {
    return [
      { kind: "set_codex_thread", threadId },
      {
        kind: "update_thinking",
        label: "Starting Codex SDK...",
        detail: "Restoring saved context...",
      },
    ];
  }
  if (event.type === "turn.started") {
    return [
      {
        kind: "update_thinking",
        label: "Starting Codex SDK...",
        detail: "Codex is reasoning...",
      },
    ];
  }
  const delta = nonEmptyDelta(event);
  if (event.type === "item.agent_message.delta" && delta) {
    return [{ kind: "stream_text_delta", text: delta }];
  }
  if (event.type === "item.reasoning.delta" && delta) {
    return [{ kind: "update_reasoning", text: delta }];
  }
  const item = event.item;
  if (
    typeof event.type === "string" &&
    CODEX_ITEM_EVENT_TYPES.has(event.type) &&
    item &&
    typeof item === "object" &&
    !Array.isArray(item)
  ) {
    return codexItemEvents(event.type, item);
  }
  if (event.type === "turn.completed") {
    return [{ kind: "mark_last_complete" }];
  }
  return [];
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
