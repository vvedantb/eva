import { describe, expect, test } from "vitest";
import { condenseRunnerLogTail } from "../convex/_sandbox_runtime/launch";

/** Mirrors RUNNER_LOG_TAIL_MAX_CHARS in launch.ts (module-private there). */
const RUNNER_LOG_TAIL_CAP = 2_000;

/**
 * Runner failures are quoted verbatim into the failed turn's assistant bubble.
 * A retrying daemon repeats one line dozens of times (an observed failure wrote
 * a 17.8KB bubble of identical heartbeat retries), so the tail is condensed
 * before it reaches chat.
 */
describe("condenseRunnerLogTail", () => {
  test("collapses retries that differ only in their numbers", () => {
    const log = [
      "streaming heartbeat attempt 1 failed, retrying in 1211ms: 404",
      "streaming heartbeat attempt 2 failed, retrying in 2022ms: 404",
      "streaming heartbeat attempt 3 failed, retrying in 4484ms: 404",
      "Callback preflight failed: 404",
    ].join("\n");
    expect(condenseRunnerLogTail(log)).toBe(
      [
        "streaming heartbeat attempt 1 failed, retrying in 1211ms: 404 (x3)",
        "Callback preflight failed: 404",
      ].join("\n"),
    );
  });

  test("keeps distinct lines and the original text verbatim", () => {
    const log = "starting daemon on port 39125\nprompt claimed\ndone";
    expect(condenseRunnerLogTail(log)).toBe(log);
  });

  test("collapses a repeated failure to a single counted line", () => {
    // Lines differing only in their numbers are the same failure retrying, so
    // 4000 of them must not survive as 4000 lines.
    const log = Array.from({ length: 4000 }, (_, i) => `line ${i} x`).join("\n");
    expect(condenseRunnerLogTail(log)).toBe("line 0 x (x4000)");
  });

  test("keeps the tail when genuinely distinct lines exceed the cap", () => {
    // Distinct words, so nothing collapses and the cap has to do the work.
    const log = Array.from(
      { length: 600 },
      (_, i) => `step-${"ab".repeat((i % 7) + 1)}-${i} failed`,
    ).join("\n");
    const condensed = condenseRunnerLogTail(log);
    expect(condensed.length).toBeLessThanOrEqual(RUNNER_LOG_TAIL_CAP + 1);
    expect(condensed.startsWith("…")).toBe(true);
    expect(condensed.endsWith("failed")).toBe(true);
  });

  test("redacts tokens in the condensed tail", () => {
    expect(condenseRunnerLogTail("clone https://x-access-token:ghs_secret@github.com/a/b")).toBe(
      "clone https://x-access-token:***@github.com/a/b",
    );
  });
});
