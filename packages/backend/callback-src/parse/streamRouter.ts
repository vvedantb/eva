import { PROVIDER } from "../config.js";
import { flushStreaming } from "../runtime/heartbeats.js";
import { getProviderAdapter } from "../providers/index.js";
import { appendToRawLogFile, appendToRawOutput } from "../runtime/buffers.js";
import { callbackState as S } from "../runtime/state.js";
import { tryParseJson } from "../utils.js";

/** Durable log + bounded buffer + live stream for one parsed JSON line. */
export function emitParsedStreamLine(line: string): void {
  appendToRawLogFile(line);
  appendToRawOutput(line);
  processRealtimeStdoutChunk(line);
}

/** Buffers stdout chunks and processes complete lines for realtime event handling. */
export function processRealtimeStdoutChunk(text: string): void {
  S.realtimeOutputBuffer += text;
  while (true) {
    const newlineIndex = S.realtimeOutputBuffer.indexOf("\n");
    if (newlineIndex === -1) {
      return;
    }
    const line = S.realtimeOutputBuffer.slice(0, newlineIndex).trim();
    S.realtimeOutputBuffer = S.realtimeOutputBuffer.slice(newlineIndex + 1);
    if (!line) {
      continue;
    }
    handleRealtimeStreamLine(line);
    // SDK providers run in-process. Drain their complete event lines now so
    // live tool activity does not depend on a timer getting scheduled while
    // the SDK is producing a busy stream. The interval remains the recovery
    // path for partial lines and events arriving during an in-flight flush.
    void flushStreaming();
  }
}

function handleRealtimeStreamLine(line: string): void {
  const parsed = tryParseJson(line);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return;
  }
  getProviderAdapter(PROVIDER).onStreamLine(line, parsed);
}
