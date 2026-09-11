import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const testsDir = dirname(fileURLToPath(import.meta.url));

const daemonSource = readFileSync(
  join(testsDir, "../callback-src/providers/claudeSdkDaemon.ts"),
  "utf8",
);
const helperSource = readFileSync(
  join(testsDir, "../callback-src/runtime/daemonProcess.ts"),
  "utf8",
);

const OWNERSHIP_GATE = "if (readPidFromFile(params.paths.pid) !== currentPid)";

/**
 * The pidfile IS the single-daemon fence: whoever owns it is the daemon for the
 * entity, and every other daemon reads it on an interval and exits when it no
 * longer names them. So an unlink by a daemon that has already been deposed
 * does not clean up after itself — it deletes the RIVAL's claim, the healthy
 * rival reads owner=none, and the entity is left with zero daemons (fix
 * f48e06fe: failTurnAndExit and exitWithoutCompletion both did exactly this).
 *
 * Teardown now lives in cleanOwnedDaemonMarkers so Claude/Cursor/Codex cannot
 * drift. New exit paths must call that helper (or a wrapper around it).
 */
describe("daemon marker files are only removed by their owner", () => {
  const unlinks = [...helperSource.matchAll(/unlinkSync\(path\)/g)];
  const helperBody = functionBody(
    helperSource,
    "export function cleanOwnedDaemonMarkers(",
  );

  test("the teardown paths this pins still exist", () => {
    expect(unlinks.length).toBeGreaterThanOrEqual(1);
    expect(daemonSource).toContain("async function failTurnAndExit(");
    expect(daemonSource).toContain("async function exitWithoutCompletion(");
    expect(daemonSource).toContain("cleanOwnedMarkers(");
  });

  test("the shared helper gates every unlink on pidfile ownership", () => {
    const gateAt = helperBody.indexOf(OWNERSHIP_GATE);
    const unlinkAt = helperBody.indexOf("unlinkSync(path)");
    expect(gateAt, "the ownership gate moved").toBeGreaterThan(-1);
    expect(unlinkAt, "the marker unlink moved").toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(unlinkAt);
    expect(helperBody).toContain("return;");
  });

  test.each([
    "failTurnAndExit",
    "exitWithoutCompletion",
    "runSdkDaemon",
  ] as const)("%s tears down through the owned-marker helper", (name) => {
    const body =
      name === "runSdkDaemon"
        ? functionBody(daemonSource, "export async function runSdkDaemon(")
        : functionBody(daemonSource, `async function ${name}(`);
    expect(body).toContain("cleanOwnedMarkers(");
    expect(body).not.toContain("unlinkSync(");
  });

  /**
   * The boot claim is the one place that writes the pidfile, and it must only
   * do so after checking for a live rival — otherwise two daemons claim the
   * same entity and flip-flop the shared streaming row.
   */
  test("the boot claim checks for a live rival before writing the pidfile", () => {
    const claim = functionBody(
      helperSource,
      "export function claimDaemonPidfileBoot(",
    );
    const rivalAt = claim.indexOf("const rivalPid = readPidFromFile(");
    const writeAt = claim.indexOf("writeFileSync(params.paths.pid");
    expect(rivalAt, "the boot claim's rival probe moved").toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(-1);
    expect(
      rivalAt,
      "claiming the pidfile before probing lets two daemons own one entity",
    ).toBeLessThan(writeAt);
    expect(claim.slice(rivalAt, writeAt)).toContain("pidAlive(rivalPid)");
    expect(daemonSource).toContain("claimDaemonPidfileBoot(");
  });
});

function functionBody(source: string, declaration: string): string {
  const startAt = source.indexOf(declaration);
  expect(startAt, `${declaration} moved or was renamed`).toBeGreaterThan(-1);
  const rest = source.slice(startAt + declaration.length);
  const nextAt = rest.search(/\nexport /);
  return declaration + (nextAt < 0 ? rest : rest.slice(0, nextAt));
}
