import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { isSandboxClosingStatus } from "../convex/_sandbox/closingStatus";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");

/**
 * Manager Ave (prod session 111) answered nothing but "Turn stalled" for weeks.
 * Axiom showed each wake-up validating the same healthy sandbox and then
 * `sandbox:prewarmSessionDaemon` returning in 63ms — `skipPrewarm`, because the
 * session status was still "closed" from a stop weeks earlier. No daemon meant
 * no `claimPendingTurn`, so the turn's lease was never acquired
 * (`leaseGeneration` 0) and the watchdog errored it out after the 15-minute
 * startup timeout.
 *
 * The reuse branch of `sessionExecuteWorkflow` never calls
 * `prepareSessionSandbox`, which is the only thing that put the status back to
 * "active" — so a session that reused a healthy sandbox could never clear it.
 */
describe("a turn on a reused sandbox clears the stale closed status", () => {
  const workflow = readSource("_sessions/workflow.ts");

  test("prewarm still skips closing sessions", () => {
    expect(isSandboxClosingStatus("closed")).toBe(true);
    expect(isSandboxClosingStatus("stopping")).toBe(true);
    expect(isSandboxClosingStatus("active")).toBe(false);
  });

  test("the workflow clears the status before it prewarms the daemon", () => {
    const clearAt = workflow.indexOf(
      "internal.sessionWorkflow.clearSessionClosedStatus",
    );
    const prewarmAt = workflow.indexOf("internal.sandbox.prewarmSessionDaemon");
    expect(clearAt, "the status clear moved or was renamed").toBeGreaterThan(-1);
    expect(prewarmAt, "the prewarm step moved").toBeGreaterThan(-1);
    expect(clearAt).toBeLessThan(prewarmAt);
  });

  /**
   * A stop that is genuinely in flight must win over a turn that raced it —
   * the stop path flips the status itself once it settles.
   */
  test("only closed is cleared, never stopping", () => {
    const body = definitionBody(workflow, "clearSessionClosedStatus");
    expect(body).toContain('session.status !== "closed"');
    expect(body).not.toContain("isSandboxClosingStatus");
  });

  /**
   * Workflow steps replay by order, so the new step sits inside the block that
   * already discriminates post-cutover turns — a turnId-less workflow still in
   * flight keeps its exact journal.
   */
  test("the clear is journalled with markLaunching, not before it", () => {
    const markAt = workflow.indexOf("internal.turns.markLaunching");
    const clearAt = workflow.indexOf(
      "internal.sessionWorkflow.clearSessionClosedStatus",
    );
    expect(markAt).toBeGreaterThan(-1);
    expect(markAt).toBeLessThan(clearAt);
  });
});

/** Comments name the very calls these rules rule out, so they have to go first. */
function readSource(relativePath: string): string {
  return stripComments(
    readFileSync(join(convexDir, relativePath), "utf8").replaceAll(
      "\r\n",
      "\n",
    ),
  );
}

/** One Convex definition, ending on the `\n});` that closes it. */
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
