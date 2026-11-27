import { PROVIDER } from "../config.js";
import { flushStreaming } from "../runtime/heartbeats.js";
import { getProviderAdapter } from "../providers/index.js";
import { appendToRawLogFile, appendToRawOutput } from "../runtime/buffers.js";
import { callbackState as S } from "../runtime/state.js";
import { tryParseJsonObject } from "../utils.js";

/** Durable log + bounded buffer + live stream for one parsed JSON line. */
export function emitParsedStreamLine(line: string): void {
  appendToRawLogFile(line);
  appendToRawOutput(line);
  processRealtimeStdoutChunk(line);
}

function processRealtimeStdoutChunk(text: string): void {
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
    void flushStreaming();
  }
}

function handleRealtimeStreamLine(line: string): void {
  const parsed = tryParseJsonObject(line);
  if (!parsed) return;
  getProviderAdapter(PROVIDER).onStreamLine(line, parsed);
}
