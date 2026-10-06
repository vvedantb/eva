import { Option, Schema } from "effect";
import { NonEmptyText, lenient } from "../parse/schemaHelpers.js";
import { opencodeToolToStep } from "../parse/toolSteps.js";
import {
  probeOpencodeStateResult,
  readObject,
  readString,
  readTrimmedString,
} from "../parse/toolResultCapture.js";
import {
  syncOpencodeStateToPersist,
  writeOpencodeSessionState,
} from "../session/opencodeSession.js";
import { callbackState as S } from "../runtime/state.js";
import type { CanonicalEvent, JsonObject, StreamLineResult } from "../types.js";
import type { ProviderAdapter } from "./types.js";

/** The `type` every translated OpenCode line is dispatched on. */
const OpencodeEnvelope = Schema.Struct({
  type: Schema.optional(lenient(Schema.String)),
});

/** A `reasoning` or `text` line, carrying its delta on `part.text`. */
const TextPart = Schema.Struct({
  part: Schema.Struct({ text: NonEmptyText }),
});

/**
 * A step that finished because the model stopped. `messageID` is only read on
 * a stopping step, and is lenient so a malformed id still ends the turn.
 */
const StepFinishStop = Schema.Struct({
  part: Schema.Struct({
    reason: Schema.Literal("stop"),
    messageID: Schema.optional(lenient(NonEmptyText)),
  }),
});

const decodeEnvelope = Schema.decodeUnknownOption(OpencodeEnvelope);
const decodeTextPart = Schema.decodeUnknownOption(TextPart);
const decodeStepFinishStop = Schema.decodeUnknownOption(StepFinishStop);

/** The event type, or `undefined` when the field is missing or not a string. */
function readEventType(event: JsonObject): string | undefined {
  return Option.getOrUndefined(decodeEnvelope(event))?.type;
}

export function opencodeParseLine(event: JsonObject): CanonicalEvent[] {
  const events: CanonicalEvent[] = [];
  const type = readEventType(event);
  // Reasoning parts carry the model's actual thinking text (reasoning-capable
  // models only); previously these events were ignored.
  if (type === "reasoning") {
    const part = decodeTextPart(event);
    if (Option.isSome(part)) {
      events.push({ kind: "update_reasoning", text: part.value.part.text });
    }
    return events;
  }
  if (type === "text") {
    const part = decodeTextPart(event);
    if (Option.isSome(part)) {
      events.push({ kind: "append_text", text: part.value.part.text });
    }
    return events;
  }
  if (type === "tool_use") {
    // The part and its state stay raw JsonObjects: both are handed on whole to
    // helpers that read freeform tool input and result keys.
    const part = readObject(event, ["part"]);
    if (!part) return events;
    const state = readObject(part, ["state"]) ?? {};
    const status = readString(state, ["status"]) ?? "";
    if (status === "running") {
      const step = opencodeToolToStep(part);
      const trackingId = step.toolUseId;
      events.push(
        trackingId
          ? { kind: "push_step", step, trackingId }
          : { kind: "push_step", step },
      );
      return events;
    }
    if (status === "completed" || status === "error") {
      const step = opencodeToolToStep(part);
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
  if (type === "step_finish") {
    if (Option.isSome(decodeStepFinishStop(event))) {
      events.push({ kind: "mark_last_complete" });
    }
    return events;
  }
  return events;
}

function onStreamLine(parsed: JsonObject): StreamLineResult {
  const sessionID = readTrimmedString(parsed, ["sessionID"]) ?? "";
  let needsHeartbeat = false;
  if (sessionID && sessionID !== S.activeOpencodeSessionId) {
    S.activeOpencodeSessionId = sessionID;
    writeOpencodeSessionState();
    needsHeartbeat = true;
  }
  const type = readEventType(parsed);
  if (type === "step_start") {
    if (S.firstAssistantEventAt === 0) {
      S.firstAssistantEventAt = Date.now();
    }
  }
  if (type === "text" && Option.isSome(decodeTextPart(parsed))) {
    if (S.firstTextBlockAt === 0) {
      S.firstTextBlockAt = Date.now();
    }
  }
  if (type === "step_finish" && !S.resultEventSeen) {
    const stop = decodeStepFinishStop(parsed);
    if (Option.isSome(stop)) {
      const messageId = stop.value.part.messageID;
      if (messageId !== undefined) {
        S.opencodeFinalMessageId = messageId;
      }
      S.resultEventSeen = true;
      syncOpencodeStateToPersist();
    }
  }
  return needsHeartbeat ? { needsHeartbeat: true } : {};
}

export const opencodeAdapter: ProviderAdapter = {
  parseLine: opencodeParseLine,
  onStreamLine(_line: string, parsed: JsonObject): StreamLineResult {
    return onStreamLine(parsed);
  },
};
