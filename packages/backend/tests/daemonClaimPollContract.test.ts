import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const daemon = readSource("callback-src/providers/claudeSdkDaemon.ts");
const daemonSupervisor = readSource(
  "callback-src/runtime/daemonSupervisor.ts",
);
const bundledScript = readSource(
  "convex/_sandbox_runtime/callbackScript.generated.ts",
);

/**
 * The claim watcher polls a Convex *mutation*, so its cadence is a running cost,
 * not just latency. At a flat 50ms a warm daemon spent its whole 45-minute idle
 * window making ~20 mutation calls a second — ~54k empty claims per idle window
 * per daemon, which also flooded `convex logs` into uselessness (fix 344ecfbb).
 *
 * Both directions of this are regressions, which is why the pair is pinned:
 * flattening back to 50ms restores the cost, and dropping the fast path makes
 * every cancel and stop-task drain up to a second slower, because those ride
 * this same mutation.
 */
describe("the daemon claim poll is fast only when it has a reason to be", () => {
  const watcher = functionBody(daemon, "function startClaimWatcher(");
  const dense = withoutWhitespace(watcher);

  test("it backs off when nothing is happening", () => {
    expect(dense).toContain("selectClaimPollIntervalMs(");
    expect(
      timing("idlePollIntervalMs"),
      "an idle poll must be materially cheaper than a mid-turn one",
    ).toBeGreaterThan(timing("fastPollIntervalMs"));
  });

  test("every supervised work state keeps the fast cadence", () => {
    expect(sliceBetween(dense, "constturnInFlight=", ";")).toContain(
      "supervisor.hasWork",
    );

    const supervisorDense = withoutWhitespace(daemonSupervisor);
    const hasWork = sliceBetween(
      supervisorDense,
      "gethasWork():boolean{",
      "}",
    );
    expect(hasWork).toContain('this.active.phase!=="idle"');
    expect(hasWork).toContain("this.pendingClaimValue!==null");
  });

  /**
   * A turn ending is followed by a send-again window with no turn in flight, so
   * recency has to hold the fast cadence for a while after the last activity or
   * the next prompt eats the idle interval.
   */
  test("recent activity also keeps the fast cadence", () => {
    const selector = withoutWhitespace(
      readSource("callback-src/runtime/daemonProcess.ts"),
    );
    expect(selector).toContain(
      "now-params.lastIdleActivityAtMs<DAEMON_CLAIM_POLL_TIMING.fastPollWindowMs",
    );
    expect(
      timing("fastPollWindowMs"),
      "the window has to outlast a user typing their next message",
    ).toBeGreaterThanOrEqual(10_000);
  });

  test("the two cadences are chosen by those two conditions and nothing else", () => {
    expect(dense).toContain(
      "awaitsleep(selectClaimPollIntervalMs({busy:turnInFlight,lastIdleActivityAtMs,}),)",
    );
    const selector = withoutWhitespace(
      readSource("callback-src/runtime/daemonProcess.ts"),
    );
    expect(selector).toContain("params.busy||recentlyActive");
    expect(selector).toContain("DAEMON_CLAIM_POLL_TIMING.fastPollIntervalMs");
    expect(selector).toContain("DAEMON_CLAIM_POLL_TIMING.idlePollIntervalMs");
  });

  /**
   * Sandboxes run the bundled script, not this source — a fix that never
   * reaches the bundle is not shipped.
   */
  test("the deployed callback bundle carries the backoff", () => {
    const flat = withoutWhitespace(bundledScript);
    expect(flat).toContain("PROMPT_POLL_IDLE_INTERVAL_MS=1e3");
    expect(flat).toContain(
      "turnInFlight||recentlyActive?PROMPT_POLL_INTERVAL_MS:PROMPT_POLL_IDLE_INTERVAL_MS",
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

/** Slices from a declaration to the `\n}` that closes it. */
function functionBody(source: string, declaration: string): string {
  const startAt = source.indexOf(declaration);
  expect(startAt, `${declaration} moved or was renamed`).toBeGreaterThan(-1);
  const endAt = source.indexOf("\n}", startAt);
  expect(endAt, `${declaration} is no longer a function`).toBeGreaterThan(-1);
  return source.slice(startAt, endAt);
}

function sliceBetween(source: string, from: string, to: string): string {
  const startAt = source.indexOf(from);
  expect(startAt, `${from} moved or was renamed`).toBeGreaterThan(-1);
  const endAt = source.indexOf(to, startAt + from.length);
  expect(endAt, `${to} moved or was renamed`).toBeGreaterThan(-1);
  return source.slice(startAt, endAt);
}

/** Shared poll knobs from daemonProcess.ts. */
function timing(
  name: "fastPollIntervalMs" | "idlePollIntervalMs" | "fastPollWindowMs",
): number {
  const helper = readSource("callback-src/runtime/daemonProcess.ts");
  const match = helper.match(new RegExp(`${name}:\\s*([\\d_]+)`));
  expect(match, `${name} moved or was renamed`).not.toBeNull();
  return Number((match?.[1] ?? "").replaceAll("_", ""));
}

/** Lets assertions span a prettier-wrapped call without pinning its layout. */
function withoutWhitespace(source: string): string {
  return source.replace(/\s+/g, "");
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
