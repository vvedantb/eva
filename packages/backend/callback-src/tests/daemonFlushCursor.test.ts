import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, test } from "vitest";
import {
  callbackState,
  shiftLastProcessed,
  trimRawOutputHead,
} from "../runtime/state.js";

/**
 * `flushStreaming` reads `rawOutput.slice(lastProcessed)` and skips entirely
 * while `rawOutput.length <= lastProcessed`. The cursor and the buffer are
 * therefore one value, not two: any change to the buffer that leaves the cursor
 * behind kills parsing for the rest of the process, and nothing surfaces the
 * failure — the turn just reports an empty activityLog (fix d076791f).
 */
describe("the flush cursor stays inside the buffer", () => {
  beforeEach(() => {
    callbackState.rawOutput = "";
    callbackState.lastProcessed = 0;
  });

  test("trimming the head reports how much it dropped", () => {
    callbackState.rawOutput = "0123456789abcde";
    expect(trimRawOutputHead(10)).toBe(5);
    expect(callbackState.rawOutput).toBe("56789abcde");
  });

  test("a buffer under the cap is left alone", () => {
    callbackState.rawOutput = "short";
    expect(trimRawOutputHead(10)).toBe(0);
    expect(callbackState.rawOutput).toBe("short");
  });

  /**
   * The point of shifting by exactly the trim amount: the unparsed tail has to
   * come out the same on both sides of a trim. Shifting by less re-parses lines
   * (double-counted tool steps); shifting by more silently drops them.
   */
  test("shifting by the trim amount preserves the unparsed tail", () => {
    callbackState.rawOutput = "0123456789abcde";
    callbackState.lastProcessed = 8;
    const pendingBefore = callbackState.rawOutput.slice(
      callbackState.lastProcessed,
    );

    shiftLastProcessed(trimRawOutputHead(10));

    expect(callbackState.rawOutput.slice(callbackState.lastProcessed)).toBe(
      pendingBefore,
    );
  });

  /** A negative cursor would make the slice re-read the whole buffer. */
  test("a trim larger than the cursor clamps at the head", () => {
    callbackState.lastProcessed = 3;
    shiftLastProcessed(500);
    expect(callbackState.lastProcessed).toBe(0);
  });

  /**
   * The dead-flush state itself: a cursor past the end of the buffer makes the
   * guard permanently true, so nothing is ever parsed again.
   */
  test("a trimmed buffer never leaves the cursor past its end", () => {
    callbackState.rawOutput = "0123456789abcde";
    callbackState.lastProcessed = callbackState.rawOutput.length;

    shiftLastProcessed(trimRawOutputHead(10));

    expect(callbackState.lastProcessed).toBeLessThanOrEqual(
      callbackState.rawOutput.length,
    );
  });
});

/**
 * The same invariant on the per-turn reset, which is where it actually broke:
 * `resetTurnState` truncated rawOutput but left the cursor high, so from turn 2
 * the flush loop was dead and every tool-using turn persisted `activityLog:
 * "[]"` (fix d076791f).
 */
describe("resetting the turn resets the cursor with it", () => {
  const daemon = readSource("providers/claudeSdkDaemon.ts");
  const reset = functionBody(
    readSource("runtime/state.ts"),
    "export function resetDaemonTurnStreamingState(): void {",
  );

  test("clearing the buffer also rewinds the cursor", () => {
    expect(daemon).toContain("resetDaemonTurnStreamingState()");
    expect(reset).toContain('callbackState.rawOutput = ""');
    expect(
      reset,
      "a cleared buffer with a live cursor kills flushing",
    ).toContain("callbackState.lastProcessed = 0");
  });

  /**
   * Only `flushStreaming` parses buffered lines into `accumulatedSteps`, so the
   * completion payload has to be built after a drain. Moving the flush after the
   * completion mutation is exactly the reorder that emptied the activity log.
   */
  test("the turn is drained before its activity log is read", () => {
    const finalize = functionBody(daemon, "async function finalizeTurn(");
    const flushAt = finalize.indexOf("await drainStreamingAndCompleteSteps()");
    const serializeAt = finalize.indexOf("serializeSteps(S.accumulatedSteps)");
    expect(flushAt, "the pre-completion drain is gone").toBeGreaterThan(-1);
    expect(serializeAt, "the activity log build moved").toBeGreaterThan(-1);
    expect(flushAt).toBeLessThan(serializeAt);
  });

  /** And the drain has to precede the mutation that persists the payload. */
  test("the drain precedes the completion mutation", () => {
    const finalize = functionBody(daemon, "async function finalizeTurn(");
    expect(
      finalize.indexOf("await drainStreamingAndCompleteSteps()"),
    ).toBeLessThan(finalize.indexOf("deliverCompletionWithMedia("));
  });
});

describe("concurrent flushes share a complete drain", () => {
  const heartbeats = readSource("runtime/heartbeats.ts");
  const router = readSource("parse/streamRouter.ts");

  test("a caller arriving during a flush awaits the active drain", () => {
    const flush = functionBody(
      heartbeats,
      "export function flushStreaming(): Promise<void> {",
    );
    expect(flush).toContain("if (activeFlush) return activeFlush");
    expect(flush).toContain("flushRequested = true");
  });

  test("the drain repeats when another event arrives in flight", () => {
    const drain = functionBody(
      heartbeats,
      "async function drainRequestedFlushes(): Promise<void> {",
    );
    expect(drain).toContain("while (flushRequested)");
  });

  test("realtime parsing has one heartbeat writer", () => {
    expect(router).not.toContain("sendStreamingHeartbeatUpdate");
    expect(router).toContain("void flushStreaming()");
  });
});

/** Comments name the very calls these rules rule out, so they have to go first. */
function readSource(relativePath: string): string {
  return stripComments(
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "..", relativePath),
      "utf8",
    ).replaceAll("\r\n", "\n"),
  );
}

/** Slices from a declaration to the next top-level one. */
function functionBody(source: string, declaration: string): string {
  const startAt = source.indexOf(declaration);
  expect(startAt, `${declaration} moved or was renamed`).toBeGreaterThan(-1);
  const rest = source.slice(startAt + declaration.length);
  const nextAt = rest.search(/\n(?:export |async function |function |const )/);
  return declaration + (nextAt < 0 ? rest : rest.slice(0, nextAt));
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
