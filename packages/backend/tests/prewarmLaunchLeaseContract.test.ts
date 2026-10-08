import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const testsDir = dirname(fileURLToPath(import.meta.url));

function convexSource(path: string): string {
  return readFileSync(join(testsDir, "../convex", path), "utf8");
}

const executionSource = convexSource("_sandbox_runtime/execution.ts");
const snapshotSource = convexSource("_sandbox_runtime/daemonEntitySnapshot.ts");

function functionBody(source: string, declaration: string): string {
  const startAt = source.indexOf(declaration);
  expect(startAt, `${declaration} moved or was renamed`).toBeGreaterThan(-1);
  const nextAt = source.indexOf("\nexport ", startAt + 1);
  return source.slice(startAt, nextAt < 0 ? undefined : nextAt);
}

function constant(source: string, name: string): number {
  const match = source.match(new RegExp(`const ${name} = ([\\d_]+)`));
  expect(match, `${name} moved or was renamed`).not.toBeNull();
  return Number(match?.[1]?.replaceAll("_", ""));
}

/**
 * Page-open prewarm claims the launch lease with `session.lastModel`. A send
 * that switches models (Ave: grok-4.6 warm-up, then grok-4.5 send) used to
 * schedule one prewarm, lose that lease, and return. The leftover daemon then
 * mismatch-polled `claimPendingTurn` for minutes because nothing retried.
 * Losers must wait, re-probe, and steal the spawn once the holder finishes.
 */
describe("prewarm does not skip when the launch lease is held", () => {
  const prewarm = functionBody(
    executionSource,
    "async function runPrewarmEntityDaemon(",
  );

  test("a held lease waits instead of returning immediately", () => {
    const heldAt = prewarm.indexOf("launch lease held — waiting");
    expect(
      heldAt,
      "the wait log is what distinguishes waiting from the old skip",
    ).toBeGreaterThan(-1);
    const giveUpAt = prewarm.indexOf("launch lease held — giving up");
    expect(giveUpAt, "the timeout path moved").toBeGreaterThan(heldAt);
    const sleepAt = prewarm.indexOf("await sleep(PREWARM_LAUNCH_LEASE_POLL_MS)");
    expect(sleepAt, "the wait loop must sleep").toBeGreaterThan(heldAt);
    expect(sleepAt).toBeLessThan(giveUpAt);
  });

  test("the wait outlasts one launch-lease TTL", () => {
    expect(
      constant(executionSource, "PREWARM_LAUNCH_LEASE_WAIT_MS"),
      "a 30s docker-bound holder must be able to finish and release",
    ).toBeGreaterThan(constant(snapshotSource, "DAEMON_LAUNCH_LEASE_MS"));
  });

  test("alive state is re-probed after the lease is claimed", () => {
    const claimAt = prewarm.lastIndexOf("let leased = await claimLease()");
    const tryAt = prewarm.indexOf("try {", claimAt);
    const reprobeAt = prewarm.indexOf(
      "const aliveState = await probeAliveState()",
      tryAt,
    );
    expect(
      reprobeAt,
      "claiming with a stale first probe would launch over a daemon that came up during the wait",
    ).toBeGreaterThan(tryAt);
    expect(reprobeAt).toBeLessThan(
      prewarm.indexOf('aliveState === "optsmismatch"', tryAt),
    );
  });
});

/**
 * Ave's Ubuntu image has no docker binary. `ensureSandboxRunning` used to poll
 * `docker info` for ~30s *while holding the launch lease*, which is what let
 * the stale lastModel prewarm block the pending-turn one.
 */
describe("orchestrator prewarm does not hold the lease for dockerd", () => {
  test("session prewarm passes skipDocker from isOrchestrator", () => {
    const body = functionBody(
      executionSource,
      "export const prewarmSessionDaemon = internalAction({",
    );
    // A chat shares its session's sandbox, so the flag is read off the
    // session the chat belongs to.
    expect(body).toContain(
      "skipDocker: context?.session.isOrchestrator === true",
    );
  });

  test("the launch-lease holder forwards skipDocker into ensureSandboxRunning", () => {
    const prewarm = functionBody(
      executionSource,
      "async function runPrewarmEntityDaemon(",
    );
    const ensureAt = prewarm.indexOf("await ensureSandboxRunning(sandbox,");
    expect(ensureAt, "ensureSandboxRunning moved").toBeGreaterThan(-1);
    const call = prewarm.slice(ensureAt, prewarm.indexOf("});", ensureAt) + 3);
    expect(call).toContain("skipDocker: args.skipDocker === true");
  });
});
