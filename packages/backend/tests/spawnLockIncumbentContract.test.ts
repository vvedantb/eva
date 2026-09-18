import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const testsDir = dirname(fileURLToPath(import.meta.url));

const launchSource = readFileSync(
  join(testsDir, "../convex/_sandbox_runtime/launch.ts"),
  "utf8",
);

/**
 * `waitForRunnerReady`'s body with `//` comments stripped — the prose spells
 * out the exact conditions these tests assert on, so an assertion over the raw
 * text would match the comment instead of the code.
 */
const waitForRunnerReadyBody = (() => {
  const startAt = launchSource.indexOf("async function waitForRunnerReady(");
  expect(startAt, "waitForRunnerReady moved or was renamed").toBeGreaterThan(-1);
  const nextAt = launchSource.indexOf("\nasync function ", startAt + 1);
  return launchSource
    .slice(startAt, nextAt < 0 ? undefined : nextAt)
    .replace(/^\s*\/\/.*$/gm, "");
})();

/** `launchScript`'s body with `//` comments stripped, for the same reason. */
const launchScriptBody = (() => {
  const startAt = launchSource.indexOf("export async function launchScript(");
  expect(startAt, "launchScript moved or was renamed").toBeGreaterThan(-1);
  const nextAt = launchSource.indexOf("\nasync function ", startAt + 1);
  return launchSource
    .slice(startAt, nextAt < 0 ? undefined : nextAt)
    .replace(/^\s*\/\/.*$/gm, "");
})();

/**
 * `execDetached` returns as soon as the launcher is spawned, so the in-script
 * `rm -f` of the runner markers has not necessarily run by the time
 * `waitForRunnerReady` takes its first poll. If a previous runner for this
 * entity left `/tmp/run-design.ready` behind — a daemon killed a second
 * earlier by a "model/tools changed" respawn — that first poll reads the dead
 * predecessor's marker and the launch reports success while the new runner sits
 * dead on exit 217. Observed in prod as "runner ready in 827ms" followed by a
 * session hung on "Working…" with no daemon ever claiming the turn.
 *
 * Clearing the markers synchronously BEFORE the detached spawn is the whole
 * fix, and it is invisible at runtime — a reordering would look harmless and
 * silently restore the hang. Pin the order.
 */
describe("stale runner markers are cleared before the detached launch", () => {
  const detachedAt = launchScriptBody.indexOf("execDetached(");
  const preClearPattern =
    /execHandle\(\s*sandbox,\s*"rm -f (?<markers>[^"]*run-design\.done[^"]*)"/;

  test("the launcher whose start we race is the runner launch script", () => {
    expect(detachedAt, "the detached runner launch moved").toBeGreaterThan(-1);
    expect(launchScriptBody.slice(detachedAt)).toContain(
      "/tmp/eva-launch-runner.sh",
    );
  });

  test("a synchronous execHandle rm -f precedes execDetached", () => {
    const beforeDetached = launchScriptBody.slice(0, detachedAt);
    expect(
      preClearPattern.test(beforeDetached),
      "the marker pre-clear must be awaited before the detached spawn, not after",
    ).toBe(true);
  });

  test("every marker the readiness probes trust is pre-cleared", () => {
    const markers = launchScriptBody.match(preClearPattern)?.groups?.markers;
    expect(markers, "no synchronous marker pre-clear found").toBeDefined();
    for (const marker of [
      // waitForRunnerReady's success signal.
      "/tmp/run-design.ready",
      // waitForRunnerReady's `alive` probe.
      "/tmp/run-design.pid",
      // CALLBACK_LIVENESS_COMMAND requires this absent (lifecycle.ts).
      "/tmp/run-design.done",
    ]) {
      expect(markers).toContain(marker);
    }
  });
});

/**
 * A runner that loses the spawn flock exits before writing the ready file, so
 * `waitForRunnerReady` has to decide whether the incumbent lock holder is the
 * runner this launch actually wanted. Treating any held lock as success (the
 * pre-d1bc6b4d behaviour) silently accepted three non-runners: a stale lock fd
 * inherited by an orphaned descendant, a daemon booted with different
 * model/tools, and — for a one-shot turn — a warm daemon that will never run
 * this launch's prompt.
 *
 * The failure mode is the dangerous kind: the launch reports success and the
 * turn runs on the WRONG model, with no error anywhere. Only the structure of
 * this decision can catch a regression, so pin it.
 */
describe("a held spawn lock is only success when the incumbent matches", () => {
  const heldBranchAt = waitForRunnerReadyBody.indexOf('if (lock === "held"');

  test("held-lock reuse requires an expected daemon opts signature", () => {
    expect(heldBranchAt, "the held-lock branch moved").toBeGreaterThan(-1);
    const condition = waitForRunnerReadyBody.slice(
      heldBranchAt,
      waitForRunnerReadyBody.indexOf("{", heldBranchAt),
    );
    expect(
      condition,
      "a turn launch (no EVA_DAEMON_OPTS) must never be satisfied by a warm daemon",
    ).toContain("expectedDaemonOptsSig !== undefined");
  });

  test("the only early return under a held lock is the opts match", () => {
    const heldBranch = waitForRunnerReadyBody.slice(heldBranchAt);
    const matchAt = heldBranch.indexOf('if (incumbent === "match")');
    expect(
      matchAt,
      "reuse must be gated on the incumbent probe's match verdict",
    ).toBeGreaterThan(-1);
    const firstReturnAt = heldBranch.indexOf("return;");
    expect(
      firstReturnAt,
      "a held lock returns success before the incumbent is identified",
    ).toBeGreaterThan(matchAt);
  });

  /**
   * The probe is what distinguishes a real incumbent from a stale fd: a live
   * owner of the entity pidfile whose opts signature equals this launch's.
   * Dropping either half reopens a distinct bug.
   */
  test("the incumbent probe checks liveness and the opts signature", () => {
    const probe = waitForRunnerReadyBody.slice(
      waitForRunnerReadyBody.indexOf("const incumbent = ", heldBranchAt),
    );
    expect(probe).toContain("daemonPaths.pid");
    expect(
      probe,
      "without kill -0 a stale inherited lock fd reads as a live runner",
    ).toContain("kill -0");
    expect(probe).toContain("daemonPaths.opts");
    expect(
      probe,
      "without the opts comparison a respawn silently keeps the old model/tools",
    ).toContain("expectedDaemonOptsSig");
    expect(probe).toContain("optsmismatch");
  });

  /** An unusable incumbent is a boot failure, and must surface as one. */
  test("an unusable incumbent still throws", () => {
    expect(waitForRunnerReadyBody).toContain("runner died entityId=");
    expect(
      waitForRunnerReadyBody,
      "the lock verdict belongs in the error or this is undiagnosable in prod",
    ).toContain("spawnLock=");
  });

  /**
   * These paths are interpolated straight into a shell command, and the opts
   * signature is attacker-adjacent free-form env. Bare interpolation would be
   * a command-injection hole as well as a correctness bug.
   */
  test("every interpolated value is shell-quoted", () => {
    for (const value of [
      "fence.runnerLockPath",
      "fence.daemonPaths.pid",
      "fence.daemonPaths.opts",
      "fence.expectedDaemonOptsSig",
    ]) {
      expect(
        waitForRunnerReadyBody,
        `${value} is interpolated into a shell command unquoted`,
      ).toContain(`quote([${value}])`);
    }
  });

  /** The caller has to pass the signature it launched with, not a constant. */
  test("the launch passes its own EVA_DAEMON_OPTS as the expected signature", () => {
    expect(launchSource).toContain(
      "expectedDaemonOptsSig: opts.extraEnvVars?.EVA_DAEMON_OPTS",
    );
  });
});
