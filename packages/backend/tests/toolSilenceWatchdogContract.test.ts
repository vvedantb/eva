import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const claudeSdk = readSource("callback-src/providers/claudeSdk.ts");
const claudeSdkDaemon = readSource("callback-src/providers/claudeSdkDaemon.ts");
const codexSdk = readSource("callback-src/providers/codexSdk.ts");
const cursorSdk = readSource("callback-src/providers/cursorSdk.ts");
const opencodeSdk = readSource("callback-src/providers/opencodeSdk.ts");
const bundledScript = readSource(
  "convex/_sandbox_runtime/callbackScript.generated.ts",
);

/**
 * The SDK emits nothing between a `tool_use` and its `tool_result`, so a long
 * silent tool (Bash allows 10 min, a subagent Task longer) looks exactly like
 * a hung turn to a message-silence watchdog. Both SDK paths killed those runs
 * as "The assistant stopped responding" until fix 29aa7976 (seen in prod on a
 * web session doing a long build). The CLI path had always exempted them.
 *
 * The exemption is dangerous in one specific way: refreshing the *runtime*
 * clock as well would remove the only remaining backstop, and a genuinely
 * wedged turn holding a tool open would hang forever. So each path must
 * refresh the silence clock ONLY, and still evaluate the hard runtime cap on
 * every tick.
 */
describe("a tool in flight exempts the turn from the silence kill", () => {
  test("the SDK one-shot watchdog refreshes only the silence clock", () => {
    const body = healthTimerBody();
    const exemption = guardedBlock(body, "if (S.inFlightToolUses > 0) {");
    expect(exemption).toContain("lastMessageAt = now;");
    expect(
      exemption,
      "refreshing the runtime clock would remove the backstop",
    ).not.toContain("activeAttemptStartedAt");
  });

  test("the SDK one-shot watchdog still applies the hard runtime cap", () => {
    const body = healthTimerBody();
    const capAt = body.indexOf(
      "now - S.activeAttemptStartedAt > MAX_TOTAL_RUNTIME_MS",
    );
    const exemptionAt = body.indexOf("if (S.inFlightToolUses > 0) {");
    const silenceAt = body.indexOf(
      "now - lastMessageAt > NO_OUTPUT_TIMEOUT_MS",
    );
    expect(capAt, "the runtime cap moved").toBeGreaterThan(-1);
    expect(exemptionAt, "the tool exemption moved").toBeGreaterThan(-1);
    expect(silenceAt, "the silence kill moved").toBeGreaterThan(-1);
    // Cap first (it must fire even mid-tool), then the exemption, then the
    // silence kill it protects against.
    expect(capAt).toBeLessThan(exemptionAt);
    expect(exemptionAt).toBeLessThan(silenceAt);
  });

  test("the daemon turn watchdog refreshes only the silence clock", () => {
    const body = turnWatchdogBody();
    const exemption = guardedBlock(body, "if (S.inFlightToolUses > 0) {");
    expect(exemption).toContain("lastMessageAtMs = now;");
    expect(
      exemption,
      "refreshing the runtime clock would remove the backstop",
    ).not.toContain("turnStartedAtMs");
  });

  test("the daemon turn watchdog still applies the hard runtime cap", () => {
    const body = turnWatchdogBody();
    const exemptionAt = body.indexOf("if (S.inFlightToolUses > 0) {");
    const capAt = body.indexOf("now - turnStartedAtMs > MAX_TOTAL_RUNTIME_MS");
    const silenceAt = body.indexOf(
      "now - lastMessageAtMs > NO_MESSAGE_TIMEOUT_MS",
    );
    expect(exemptionAt, "the tool exemption moved").toBeGreaterThan(-1);
    expect(capAt, "the runtime cap moved").toBeGreaterThan(-1);
    expect(silenceAt, "the silence kill moved").toBeGreaterThan(-1);
    expect(exemptionAt).toBeLessThan(capAt);
    expect(capAt).toBeLessThan(silenceAt);

    // Only the blocking-question branch may hold the turn open indefinitely.
    const runtimeResets = body.split("turnStartedAtMs = now").length - 1;
    expect(runtimeResets, "one reset, in the awaiting-answer branch").toBe(1);
    expect(body.indexOf("turnStartedAtMs = now")).toBeLessThan(exemptionAt);
  });

  /**
   * The CLI runner used to carry the original version of this exemption and was
   * the reference the SDK runners were fixed against. It is deleted, so the
   * invariant is asserted directly on the three remaining one-shot runners
   * instead — each names its silence clock differently, but all three must
   * refresh only that clock and keep the runtime cap ahead of it.
   */
  test.each([
    [
      "codex",
      () => codexSdk,
      "if (S.inFlightToolUses > 0) {",
      "lastEventAt = now;",
      "S.activeAttemptStartedAt",
    ],
    [
      "cursor",
      () => cursorSdk,
      // Cursor also exempts an in-place compaction: replacing a compacting
      // agent is the rotation the resume-always design forbids.
      "if (S.inFlightToolUses > 0 || compactionInFlight) {",
      "lastMessageAt = now;",
      "S.activeAttemptStartedAt",
    ],
    [
      "opencode",
      () => opencodeSdk,
      "if (S.inFlightToolUses > 0) {",
      "watchdogClock = now;",
      "S.activeAttemptStartedAt",
    ],
  ])(
    "the %s one-shot watchdog refreshes only its silence clock",
    (_name, read, guard, refresh, runtimeClock) => {
      const body = sliceBetween(
        read(),
        "const healthTimer = setInterval(() => {",
        "}, NO_OUTPUT_CHECK_INTERVAL_MS);",
      );
      const exemption = guardedBlock(body, guard);
      expect(exemption).toContain(refresh);
      expect(
        exemption,
        "refreshing the runtime clock would remove the backstop",
      ).not.toContain(runtimeClock);

      const capAt = body.indexOf(
        "now - S.activeAttemptStartedAt > MAX_TOTAL_RUNTIME_MS",
      );
      const exemptionAt = body.indexOf(guard);
      expect(capAt, "the runtime cap moved").toBeGreaterThan(-1);
      // The cap must be evaluated before the exemption so a turn wedged while
      // holding a tool open is still bounded.
      expect(capAt).toBeLessThan(exemptionAt);
    },
  );

  /**
   * Sandboxes run the bundled script, not these sources — a fix that never
   * reaches the bundle is not shipped.
   */
  test("the deployed callback bundle carries both SDK exemptions", () => {
    // esbuild may suffix locals to dodge cross-module collisions (`now2`);
    // the exemption's shape is the contract, not the mangled identifier.
    const flat = bundledScript.replace(/\s+/g, " ");
    expect(flat).toMatch(
      /if \(callbackState\.inFlightToolUses > 0\) \{ lastMessageAt = now\d*; \}/,
    );
    expect(flat).toMatch(
      /if \(callbackState\.inFlightToolUses > 0\) \{ lastMessageAtMs = now\d*; \}/,
    );
  });
});

function readSource(relativePath: string): string {
  return stripComments(
    readFileSync(join(backendDir, relativePath), "utf8").replaceAll(
      "\r\n",
      "\n",
    ),
  );
}

/** The one-shot SDK health-check interval callback. */
function healthTimerBody(): string {
  return sliceBetween(
    claudeSdk,
    "const healthTimer = setInterval(() => {",
    "}, NO_OUTPUT_CHECK_INTERVAL_MS);",
  );
}

/** The daemon's per-turn watchdog interval callback. */
function turnWatchdogBody(): string {
  return sliceBetween(
    claudeSdkDaemon,
    "function startTurnWatchdog(): void {",
    "\n}",
  );
}

function sliceBetween(source: string, from: string, to: string): string {
  const startAt = source.indexOf(from);
  expect(startAt, `${from} moved or was renamed`).toBeGreaterThan(-1);
  const endAt = source.indexOf(to, startAt);
  expect(endAt, `${to} moved or was renamed`).toBeGreaterThan(-1);
  return source.slice(startAt, endAt);
}

/** The brace-balanced block introduced by `guard` (which ends in `{`). */
function guardedBlock(source: string, guard: string): string {
  const startAt = source.indexOf(guard);
  expect(startAt, `${guard} moved or was renamed`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = startAt + guard.length - 1; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(startAt, i + 1);
    }
  }
  throw new Error(`Unbalanced braces after ${guard}`);
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
