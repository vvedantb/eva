import { opencodeToolToStep } from "../parse/toolSteps.js";
import { probeOpencodeStateResult } from "../parse/toolResultCapture.js";
import {
  syncOpencodeStateToPersist,
  writeOpencodeSessionState,
} from "../session/opencodeSession.js";
import { callbackState as S } from "../runtime/state.js";
import type { CanonicalEvent, JsonObject, StreamLineResult } from "../types.js";
import type { ProviderAdapter } from "./types.js";

export function opencodeParseLine(event: JsonObject): CanonicalEvent[] {
  const events: CanonicalEvent[] = [];
  if (
    event.type === "reasoning" &&
    event.part &&
    typeof event.part === "object" &&
    !Array.isArray(event.part) &&
    typeof event.part.text === "string" &&
    event.part.text
  ) {
    events.push({ kind: "update_reasoning", text: event.part.text });
    return events;
  }
  if (
    event.type === "text" &&
    event.part &&
    typeof event.part === "object" &&
    !Array.isArray(event.part) &&
    typeof event.part.text === "string" &&
    event.part.text
  ) {
    events.push({ kind: "append_text", text: event.part.text });
    return events;
  }
  if (
    event.type === "tool_use" &&
    event.part &&
    typeof event.part === "object" &&
    !Array.isArray(event.part)
  ) {
    const state =
      "state" in event.part &&
      event.part.state &&
      typeof event.part.state === "object" &&
      !Array.isArray(event.part.state)
        ? event.part.state
        : {};
    const status = typeof state.status === "string" ? state.status : "";
    if (status === "running") {
      const step = opencodeToolToStep(event.part);
      const trackingId = step.toolUseId;
      events.push(
        trackingId
          ? { kind: "push_step", step, trackingId }
          : { kind: "push_step", step },
      );
      return events;
    }
    if (status === "completed" || status === "error") {
      const step = opencodeToolToStep(event.part);
      const result = probeOpencodeStateResult(state);
      events.push(
        result
          ? {
              kind: "complete_tool",
              trackingId: step.toolUseId,
              result,
            }
          : { kind: "complete_tool", trackingId: step.toolUseId },
      );
      return events;
    }
    return events;
  }
  if (event.type === "step_finish") {
    const reason =
      event.part &&
      typeof event.part === "object" &&
      !Array.isArray(event.part) &&
      typeof event.part.reason === "string"
        ? event.part.reason
        : "";
    if (reason === "stop") {
      events.push({ kind: "mark_last_complete" });
    }
    return events;
  }
  return events;
}

function onStreamLine(parsed: JsonObject): StreamLineResult {
  const sessionID =
    typeof parsed.sessionID === "string" && parsed.sessionID.trim()
      ? parsed.sessionID.trim()
      : "";
  let needsHeartbeat = false;
  if (sessionID && sessionID !== S.activeOpencodeSessionId) {
    S.activeOpencodeSessionId = sessionID;
    writeOpencodeSessionState();
    needsHeartbeat = true;
  }
  if (parsed.type === "step_start") {
    if (S.firstAssistantEventAt === 0) {
      S.firstAssistantEventAt = Date.now();
    }
  }
  if (
    parsed.type === "text" &&
    parsed.part &&
    typeof parsed.part === "object" &&
    !Array.isArray(parsed.part) &&
    typeof parsed.part.text === "string" &&
    parsed.part.text
  ) {
    if (S.firstTextBlockAt === 0) {
      S.firstTextBlockAt = Date.now();
    }
  }
  if (
    parsed.type === "step_finish" &&
    parsed.part &&
    typeof parsed.part === "object" &&
    !Array.isArray(parsed.part) &&
    parsed.part.reason === "stop" &&
    !S.resultEventSeen
  ) {
    if (typeof parsed.part.messageID === "string" && parsed.part.messageID) {
      S.opencodeFinalMessageId = parsed.part.messageID;
    }
    S.resultEventSeen = true;
    syncOpencodeStateToPersist();
  }
  return needsHeartbeat ? { needsHeartbeat: true } : {};
}

export const opencodeAdapter: ProviderAdapter = {
  parseLine: opencodeParseLine,
  onStreamLine(_line: string, parsed: JsonObject): StreamLineResult {
    return onStreamLine(parsed);
  },
};
