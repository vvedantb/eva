import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/**
 * Source contracts for the stranded-queue fixes that `chatQueueStuckCases`
 * cannot reach: the daemon only runs in a sandbox, and the parallel-chat slot
 * ordering needs three live session workflows to reproduce.
 */

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const daemonSurfaces: [string, string][] = [
  ["callback source", read("callback-src/providers/claudeSdkDaemon.ts")],
  [
    "deployed bundle",
    read("convex/_sandbox_runtime/callbackScript.generated.ts"),
  ],
];

describe("background shells do not hold the chat queue", () => {
  /**
   * The SDK reports a background Bash command as a task. Stored as a subagent,
   * a dev server that never ends blocked queued messages for the 2-hour cap.
   */
  test.each(daemonSurfaces)(
    "a local_bash task is skipped before it is stored (%s)",
    (_label, source) => {
      const handler = slice(
        source,
        "function handleSystemTaskMessage(",
        "function failSyntheticTurn(",
      );
      const skipAt = handler.indexOf('"task_type") === "local_bash"');
      const returnAt = handler.indexOf("return;", skipAt);
      const storeAt = handler.indexOf("unsettledBackgroundAgents.set(");
      expect(skipAt).toBeGreaterThan(-1);
      expect(storeAt).toBeGreaterThan(-1);
      expect(returnAt).toBeLessThan(storeAt);
    },
  );
});

describe("an expired turn frees its parallel-chat slot before the drain", () => {
  /**
   * An open turn counts against `MAX_PARALLEL_CHATS`. Draining before the
   * close left a sibling parked on the cap with no later drain to release it.
   */
  test("closeTurn runs before either branch drains", () => {
    const body = slice(
      read("convex/turns.ts"),
      "async function finalizeExpiredChatTurn<",
      "async function finalizeExpiredAgentTurn(",
    );
    const closeAt = body.indexOf("await closeTurn(ctx, turn,");
    const staleAt = body.indexOf("await finalizeStaleChatTurn(");
    const drainAt = body.indexOf("await adapter.drainQueue(");
    expect(closeAt).toBeGreaterThan(-1);
    expect(staleAt).toBeGreaterThan(closeAt);
    expect(drainAt).toBeGreaterThan(closeAt);
  });
});

function slice(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function read(relativePath: string): string {
  return readFileSync(join(backendDir, relativePath), "utf8")
    .replaceAll("\r\n", "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
