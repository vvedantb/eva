import { createWriteStream } from "fs";
import { OUTPUT_BUFFER_MAX_BYTES, RAW_LOG_FILE } from "../config.js";
import {
  callbackState as S,
  appendRawOutputChunk,
  assignRawLogStream,
  incrementRawLogBytesWritten,
  setRawLogStreamFailed,
  shiftLastProcessed,
  trimRawOutputHead,
} from "../runtime/state.js";

/** Trims a string to at most OUTPUT_BUFFER_MAX_BYTES bytes, dropping from the head. */
export function trimBufferHead(buf: string): string {
  if (buf.length <= OUTPUT_BUFFER_MAX_BYTES) return buf;
  return buf.slice(buf.length - OUTPUT_BUFFER_MAX_BYTES);
}

/** Appends to S.rawOutput with head trimming. Shifts S.lastProcessed by the same amount so
 * flushStreaming's line cursor stays aligned with the retained tail after a trim. */
export function appendToRawOutput(text: string): void {
  appendRawOutputChunk(text);
  const trimAmount = trimRawOutputHead(OUTPUT_BUFFER_MAX_BYTES);
  if (trimAmount > 0) {
    shiftLastProcessed(trimAmount);
  }
}

/** Durable append-only mirror of stdout chunks. */
export function recordSdkRetry(detail: string): void {
  appendToRawLogFile("[sdk-retry] " + detail + "\n");
}

/** Records an SDK attempt failure in the raw log and the trimmed stderr buffer. */
export function recordSdkAttemptFailure(
  message: string,
  extras?: { stderrMessage?: string; extraStderr?: string },
): void {
  appendToRawLogFile("[sdk-error] " + message + "\n");
  const stderr =
    (extras?.stderrMessage ?? message) +
    "\n" +
    (extras?.extraStderr ? extras.extraStderr + "\n" : "");
  S.stderrOutput = trimBufferHead(S.stderrOutput + stderr);
}

/** Durable append-only mirror of stdout chunks. */
export function appendToRawLogFile(text: string): void {
  if (S.rawLogStreamFailed || !text) return;
  try {
    if (!S.rawLogStream) {
      const stream = createWriteStream(RAW_LOG_FILE, { flags: "a" });
      stream.on("error", (err) => {
        setRawLogStreamFailed(true);
        console.error(
          "Raw log stream error: " +
            String(err instanceof Error ? err.message : err),
        );
      });
      assignRawLogStream(stream);
      stream.write(text);
    } else {
      S.rawLogStream.write(text);
    }
    incrementRawLogBytesWritten(Buffer.byteLength(text));
  } catch (err) {
    setRawLogStreamFailed(true);
    console.error(
      "Failed to append to raw log: " +
        String(err instanceof Error ? err.message : err),
    );
  }
}
