import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { isSupersededStart } from "../convex/_sandbox/transitions";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");
const sessions = readSource("_sandbox_runtime/sessions.ts");

/**
 * Found on a live sandbox (#1064): a superseded start's writes were already
 * ignored, but its remaining steps still ran on the VM, and its dev-server
 * relaunch dropped every terminal the newer start had attached. Its abort
 * handler also stopped the VM the newer start was resuming.
 */
describe("isSupersededStart", () => {
  test("an untokened start is never superseded", () => {
    expect(isSupersededStart(undefined, undefined)).toBe(false);
    expect(isSupersededStart(3, undefined)).toBe(false);
  });

  test("the current attempt is not superseded", () => {
    expect(isSupersededStart(2, 2)).toBe(false);
  });

  test("an older attempt, or a row with no attempt, is superseded", () => {
    expect(isSupersededStart(3, 2)).toBe(true);
    expect(isSupersededStart(undefined, 1)).toBe(true);
  });
});

const PREDICATES = [
  "sessionStopRequested",
  "taskStopRequested",
  "projectStopRequested",
] as const;

describe("a superseded start gives up instead of running on the live VM", () => {
  test.each(PREDICATES)("%s also aborts a superseded start", (name) => {
    expect(
      bodyOf(name),
      `${name} only checks stop, so a superseded start keeps running`,
    ).toMatch(/isSupersededStart\(\s*\w+\.sandboxStartAttempt,\s*startAttempt\s*\)/);
  });

  /**
   * `startAttempt` is optional, so a call that drops it type-checks and quietly
   * turns the start back into an untokened one that is never superseded.
   */
  test("every stop poll passes the start's attempt", () => {
    const calls = [
      ...sessions.matchAll(
        /\b(sessionStopRequested|taskStopRequested|projectStopRequested|abortReuseIfSessionStopped)\(([^)]*)\)/g,
      ),
    ].filter((call) => !call[2].includes(":"));
    expect(calls.length, "the stop polls moved").toBeGreaterThanOrEqual(5);
    for (const [call] of calls) {
      expect(call, "a stop poll dropped startAttempt").toMatch(
        /startAttempt\s*,?\s*\)$/,
      );
    }
  });
});

// Task and project preview starts share `runPreviewStart`.
const START_ACTIONS = ["startSessionSandbox", "runPreviewStart"] as const;

describe("a superseded start leaves the VM to the newer start", () => {
  test.each(START_ACTIONS)(
    "%s checks for a newer start before every stop in its catch",
    (name) => {
      const body = bodyOf(name);
      const handler = body.slice(body.lastIndexOf("} catch (e) {"));
      const segments = handler.split("internal.sandbox.stopSandbox");
      expect(segments.length, `${name} no longer stops on abort`).toBeGreaterThan(1);
      // Each segment before a stop must decide `superseded` and skip on it.
      for (const segment of segments.slice(0, -1)) {
        expect(segment, `${name} stops the VM a newer start owns`).toContain(
          "isSupersededStart(",
        );
        expect(segment.slice(segment.lastIndexOf("isSupersededStart("))).toMatch(
          /!superseded|if \(superseded\) return/,
        );
      }
    },
  );
});

/** The top-level definition `name`, sliced to the next column-zero one. */
function bodyOf(name: string): string {
  const boundaries = [
    ...sessions.matchAll(/\n(?:export )?(?:async )?(?:function|const) (\w+)/g),
  ];
  const index = boundaries.findIndex((match) => match[1] === name);
  expect(index, `${name} moved or was renamed`).toBeGreaterThan(-1);
  return sessions.slice(
    boundaries[index]?.index ?? 0,
    boundaries[index + 1]?.index ?? sessions.length,
  );
}

/** Comments name the very calls these rules check, so they have to go first. */
function readSource(relativePath: string): string {
  return readFileSync(join(convexDir, relativePath), "utf8")
    .replaceAll("\r\n", "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
