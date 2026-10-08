import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const lifecycle = readFileSync(
  join(backendDir, "convex/_sandbox_runtime/lifecycle.ts"),
  "utf8",
).replaceAll("\r\n", "\n");

/** The pattern the liveness probe hands to `pgrep -f`, as it reaches the shell. */
function agentLivenessPgrepPattern(): string {
  const declarationAt = lifecycle.indexOf(
    "const AGENT_PROCESS_LIVENESS_COMMAND =",
  );
  expect(
    declarationAt,
    "AGENT_PROCESS_LIVENESS_COMMAND moved or was renamed",
  ).toBeGreaterThan(-1);
  const match = /pgrep -f '([^']*)'/.exec(lifecycle.slice(declarationAt));
  expect(
    match,
    "the command no longer single-quotes a pgrep -f pattern",
  ).not.toBe(null);
  const pattern = match ? match[1] : "";
  // No escapes, so the source text is the shell text verbatim: bracket
  // expressions (`[.]`) express what `\.` used to, and a `\` here would mean
  // the TS literal and the shell disagree about the pattern under test.
  expect(pattern, "escape the pattern with [] classes, not backslashes").not.toContain(
    "\\",
  );
  return pattern;
}

/**
 * Prod: a session sat on "Working…" for 5+ minutes with no daemon polling.
 * Every sandbox exec runs as `bash -lc "<SOURCE_ENV> <cmd>"`, so the wrapper
 * shell's own cmdline contains the pgrep pattern text. An unbracketed pattern
 * therefore matched itself, `verifySandboxLiveness` could never return
 * `pid_dead_or_exec_failed`, and the stall watchdog kept resetting the
 * staleness clock on a dead run forever.
 *
 * pgrep -f uses POSIX extended regex; these alternatives (literals, `|`, and
 * single-character bracket expressions) mean the same under JS RegExp.
 */
describe("agent liveness pgrep pattern cannot match its own wrapper", () => {
  const pattern = agentLivenessPgrepPattern();
  const regex = new RegExp(pattern);

  test("the exec wrapper carrying the pattern text is not a match", () => {
    expect(regex.test(`bash -lc ${pattern}`)).toBe(false);
  });

  test("real agent process cmdlines still match", () => {
    for (const cmdline of [
      "node /tmp/run-design.mjs",
      "/root/.claude/local/claude --print",
      "claude-code",
      "opencode run foo",
      "codex run",
      "cursor-agent",
    ]) {
      expect(regex.test(cmdline), cmdline).toBe(true);
    }
  });

  test("idling `opencode serve` stays unmatched", () => {
    // Matching it would report every sandbox alive forever.
    expect(regex.test("opencode serve --port 4096")).toBe(false);
  });
});
