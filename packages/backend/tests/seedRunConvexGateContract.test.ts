import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");

/** Comments in this file quote the very shell the rules below rule out. */
const seedSource = stripComments(
  readFileSync(join(convexDir, "snapshotActions.ts"), "utf8"),
);
const seedRun = definitionBody(seedSource, "launchSeedRun");

/**
 * The seed run's Convex gate used to wait for `Convex functions ready`, which
 * a daemon only prints after a successful push. Any repo whose `auth.config.ts`
 * reads a deployment env var deadlocked there: the first push failed for the
 * missing value, and the seed commands that set it run *after* the gate. Every
 * scheduled build then burned the full window and failed (fix 34564b71).
 *
 * Source-text, because the failure is an ordering mistake in one generated
 * shell script and reproducing it for real means booting a sandbox.
 */
describe("the seed run gates on a live backend, not a completed push", () => {
  test("the wait ends on the backend health endpoint", () => {
    expect(seedRun).toContain(
      "curl -sf -m 3 ${CONVEX_LOCAL_BACKEND_HEALTH_URL}",
    );
  });

  test("a backend that never came up still fails the seed", () => {
    expect(seedRun).toContain(
      '${backendUp} || { echo "SEEDRUN-FAILED:convex-ready-${i}"',
    );
  });

  test("functions not yet pushed is reported, not fatal", () => {
    const grepAt = seedRun.lastIndexOf(
      'grep -q "${CONVEX_FUNCTIONS_READY_LOG_LINE}"',
    );
    expect(grepAt, "the functions-ready check moved").toBeGreaterThan(-1);
    const endAt = seedRun.indexOf("\n", grepAt);
    const line = seedRun.slice(grepAt, endAt < 0 ? undefined : endAt);
    expect(line).toContain("|| echo");
    expect(line, "the push happens after the seed commands now").not.toContain(
      "exit 1",
    );
  });

  /**
   * Health-only was too loose the other way. `convex dev`'s first push applies
   * schema.ts and backfills its indexes; landing that mid-import makes
   * `npx convex import` abort the whole restore with "Could not complete
   * import because schema changed" (observed 2026-09-21, cost-model-ts). The
   * seed run now also waits for the push — bounded, so the repos the gate was
   * loosened for still get through.
   */
  test("the import waits for the daemon's first push to land", () => {
    const waitAt = seedRun.indexOf(
      'echo "SEEDRUN-STAGE:convex-functions-ready-${i}"',
    );
    const seedAt = seedRun.indexOf('echo "SEEDRUN-STAGE:seed-commands"');
    expect(waitAt, "the functions-ready wait moved or was removed").toBeGreaterThan(
      -1,
    );
    expect(seedAt, "the seed commands no longer run after the wait").toBeGreaterThan(
      waitAt,
    );
  });

  test("the functions-ready wait is bounded", () => {
    expect(seedRun).toContain("for s in $(seq 1 ${CONVEX_FUNCTIONS_READY_ATTEMPTS})");
  });

  test("a daemon that exited ends the wait instead of burning the window", () => {
    // Without the pid the loop sleeps out its full 900s on a dead daemon.
    expect(seedRun).toContain("& echo $! > /tmp/bg-${i}.pid");
    expect(seedRun).toContain('! kill -0 "$(cat /tmp/bg-${i}.pid)"');
  });

  test("the push runs after the seed commands that set its env vars", () => {
    const gateAt = seedRun.indexOf('echo "SEEDRUN-STAGE:convex-ready-${i}"');
    const seedAt = seedRun.indexOf('echo "SEEDRUN-STAGE:seed-commands"');
    const pushAt = seedRun.indexOf("buildConvexPostSeedPushLines(");
    expect(gateAt, "the readiness gate moved").toBeGreaterThan(-1);
    expect(seedAt, "the seed-commands stage moved").toBeGreaterThan(gateAt);
    expect(pushAt, "the push stage moved before the seed commands").toBeGreaterThan(
      seedAt,
    );
  });
});

/**
 * One Convex definition, from `export const <name> = …({` to the `\n});` that
 * closes it — the closing brace at column zero, so un-exported helpers between
 * definitions are not swallowed.
 */
function definitionBody(source: string, name: string): string {
  const startAt = source.indexOf(`export const ${name} =`);
  expect(startAt, `${name} moved or was renamed`).toBeGreaterThan(-1);
  const end = source.indexOf("\n});", startAt);
  return source.slice(startAt, end < 0 ? undefined : end);
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
