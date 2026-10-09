import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const testsDir = dirname(fileURLToPath(import.meta.url));

function convexSource(path: string): string {
  return readFileSync(join(testsDir, "../convex", path), "utf8");
}

const executionSource = convexSource("_sandbox_runtime/execution.ts");
const snapshotSource = convexSource("_sandbox_runtime/daemonEntitySnapshot.ts");
const providerSource = convexSource("_sandbox/provider.ts");
const vercelSource = convexSource("_sandbox/vercelProvider.ts");

/**
 * Opening a page fires prewarmDaemon, and on Vercel *any* exec — including the
 * daemon alive-check — lazily resumes a stopped VM. That resurrected VM has no
 * dev server, no Convex backend and no Console tmux session, because services
 * only launch in the startup workflow, so the user gets a "running" sandbox that
 * does nothing (fix 5eae18ba). Nothing else in the system can catch this: the
 * exec succeeds, the prewarm reports success, and the damage is a VM the user
 * never asked to wake.
 */
describe("prewarm never resurrects a stopped sandbox", () => {
  const prewarm = functionBody(
    executionSource,
    "async function runPrewarmEntityDaemon(",
  );

  test("bails via classifyForReconcile before any exec", () => {
    const classifyAt = prewarm.indexOf("classifyForReconcile()");
    expect(
      classifyAt,
      "runPrewarmEntityDaemon must probe liveness via classifyForReconcile",
    ).toBeGreaterThan(-1);
    const guardAt = prewarm.indexOf('if (classification !== "alive")');
    expect(
      guardAt,
      "prewarm must skip when classifyForReconcile is not alive",
    ).toBeGreaterThan(classifyAt);
    // Every way this file reaches into a sandbox. The first one must come after
    // the guard, since the first is the one that does the waking.
    for (const call of ["execHandle(", "sandbox.exec(", "execDetached("]) {
      const callAt = prewarm.indexOf(call);
      if (callAt < 0) continue;
      expect(
        callAt,
        `${call} runs before the classify guard, so it can wake a stopped VM`,
      ).toBeGreaterThan(guardAt);
    }
  });

  /**
   * Prewarm is a background path, so it must never carry the explicit-start
   * escape hatch that waits out an in-flight stop.
   */
  test("does not opt into resume-after-stop", () => {
    expect(prewarm).not.toContain("resumeAfterStop");
  });

  test("only flips status when classification is dead", () => {
    expect(prewarm).toContain('if (classification === "dead")');
    expect(prewarm).toContain(
      "internal.sandboxDaemon.reconcileStoppedSandboxStatus",
    );
    // Must not reconcile off the coarse sandbox.state buckets — those miss
    // hard-timeouted VMs whose state getter invents "starting".
    expect(prewarm).not.toContain('sandbox.state === "stopped"');
  });
});

/**
 * Hard-timeouted Vercel VMs throw from sandbox.status; the state getter maps
 * that to "starting" so start/stop races stay safe. Reconcile/prewarm must
 * not trust that mapping — they have to listSessions and treat empty/terminal
 * as dead, or the UI stays "active" forever (the bug this fix targets).
 */
describe("classifyForReconcile sees through fake starting", () => {
  test("SandboxHandle requires classifyForReconcile", () => {
    expect(providerSource).toContain("classifyForReconcile(): Promise<");
  });

  test("Vercel implementation falls back to resolveSessionStatus", () => {
    const body = functionBody(
      vercelSource,
      "async classifyForReconcile(): Promise<",
    );
    expect(body).toContain("resolveSessionStatus()");
    expect(body).toContain('if (resolved.kind === "empty") return "dead"');
    expect(body).toContain('if (status === "running") return "alive"');
    expect(body).toContain("isTerminalStopStatus");
    expect(body).toContain("isStopInFlightStatus");
  });

  test("reconcile sweep flips on dead, not on coarse sandbox.state", () => {
    const body = functionBody(
      executionSource,
      "export const reconcileStaleActiveSandboxes =",
    );
    expect(body).toContain("classifyForReconcile()");
    expect(body).toContain('if (classification === "dead")');
    expect(body).not.toContain('sandbox.state === "stopped"');
  });
});
/**
 * The self-heal half of the same fix: a stopped VM whose entity status still
 * reads "active" is what let the Console/PTY path resume it. Flipping to
 * "closed" is what makes the UI offer Start — the one path that relaunches
 * services — so the guards on that flip have to stay exact.
 */
describe("reconcileStoppedSandboxStatus", () => {
  const body = functionBody(
    snapshotSource,
    "export const reconcileStoppedSandboxStatus =",
  );

  /**
   * Split per entity table, so a guard present in the sessions branch cannot
   * stand in for one missing from projects.
   */
  const branches = [
    {
      table: "sessions",
      statusField: "doc.status",
      closed: 'status: "closed"',
    },
    {
      table: "agentTasks",
      statusField: "doc.reviewTaskSandboxStatus",
      closed: 'reviewTaskSandboxStatus: "closed"',
    },
    {
      table: "projects",
      statusField: "doc.reviewProjectSandboxStatus",
      closed: 'reviewProjectSandboxStatus: "closed"',
    },
  ];

  test.each(branches)(
    "$table flips only an exactly-active status",
    ({ table, statusField, closed }) => {
      const branch = entityBranch(body, table);
      // `!== "active"` and nothing looser: "starting"/"stopping"/"closed" belong
      // to the start and stop flows, which are mid-transition and own the field.
      expect(
        branch,
        `${table} must bail unless the status is exactly "active"`,
      ).toContain(`if (${statusField} !== "active") return null;`);
      expect(branch).toContain(closed);
    },
  );

  test.each(branches)(
    "$table only flips the sandbox the caller observed",
    ({ table }) => {
      const branch = entityBranch(body, table);
      // A newer sandbox on the doc means the entity already moved on, and
      // closing it would kill a live sandbox off a stale observation.
      expect(branch).toContain("doc.sandboxId !== args.sandboxId");
    },
  );
});

/**
 * `resumeAfterStop: true` is the one way for a start to win a race against a
 * stop, so it belongs to explicit user starts only. A background path that
 * picked it up could resume a sandbox the user had just stopped — the same
 * resurrection this whole file exists to prevent, arriving by a second route.
 *
 * The allow-list is per file rather than per call site, since the stop checks
 * that make it safe live in the callers and workflows, not beside the option.
 */
describe("resumeAfterStop call sites", () => {
  const files = [
    // tryResumeSandbox, reached only from createOrResumeSandbox.
    "_sandbox_runtime/git.ts",
    // resumeReusedSandbox — stop-checked either side of ensureSandboxRunning.
    "_sandbox_runtime/sessions.ts",
    // ensureSandboxRunning itself: forwards the caller's option.
    "_sandbox_runtime/helpers.ts",
    // Explicit retention repair cycles a live sandbox to mint a policy-compliant snap.
    "_sandbox_runtime/bulkSnapshotRetention.ts",
    // PR description: only when the user moves a task to code review
    // (`agentTasks.updateStatus` sets `restoreStoppedSandbox`).
    "_github/prDescription.ts",
  ];

  test("all sit in a file on the allow-list", () => {
    const convexDir = join(testsDir, "../convex");
    const offenders = readdirSync(convexDir, { recursive: true })
      .map(String)
      .filter((path) => path.endsWith(".ts"))
      // Generated bundles are copies of source that is audited above.
      .filter((path) => !path.includes("_generated"))
      .filter((path) => !path.endsWith(".generated.ts"))
      .filter((path) => !files.includes(path.replaceAll("\\", "/")))
      .filter((path) =>
        readFileSync(join(convexDir, path), "utf8").includes(
          "resumeAfterStop: true",
        ),
      );
    expect(
      offenders,
      "only explicit user starts may wait out a stop — add a note above if this is one",
    ).toEqual([]);
  });

  /** The allow-list is worthless if it has drifted off the real call sites. */
  test("cover every allow-listed file", () => {
    for (const path of files) {
      expect(
        convexSource(path),
        `${path} no longer uses resumeAfterStop — drop it from the list`,
      ).toContain("resumeAfterStop");
    }
  });
});

/**
 * Slices from a declaration to the next top-level one, so an assertion cannot be
 * satisfied by a match in a neighbouring function.
 */
function functionBody(source: string, declaration: string): string {
  const startAt = source.indexOf(declaration);
  expect(startAt, `${declaration} moved or was renamed`).toBeGreaterThan(-1);
  const nextAt = source.indexOf("\nexport ", startAt + 1);
  return source.slice(startAt, nextAt < 0 ? undefined : nextAt);
}

/** One `if (args.entityTable === "…")` branch, or the trailing else for projects. */
function entityBranch(body: string, table: string): string {
  const marker = `if (args.entityTable === "${table}")`;
  const startAt = body.indexOf(marker);
  if (startAt > -1) {
    const nextAt = body.indexOf('if (args.entityTable === "', startAt + 1);
    return body.slice(startAt, nextAt < 0 ? undefined : nextAt);
  }
  // The last table needs no `if`, so it is the fall-through after the others:
  // everything past the closing brace of the final guarded branch. Found by
  // counting braces rather than by matching an indented `return null;` — the
  // latter matched the end of the whole handler, so this returned three lines
  // of tail and every assertion below it passed on nothing.
  const lastAt = body.lastIndexOf('if (args.entityTable === "');
  expect(lastAt, `${table} has no branch`).toBeGreaterThan(-1);
  return body.slice(afterBlock(body, lastAt));
}

/** Index just past the `}` closing the first block opened at or after `startAt`. */
function afterBlock(source: string, startAt: number): number {
  let depth = 0;
  for (let at = startAt; at < source.length; at += 1) {
    if (source[at] === "{") depth += 1;
    else if (source[at] === "}") {
      depth -= 1;
      if (depth === 0) return at + 1;
    }
  }
  throw new Error(`unterminated block at index ${startAt}`);
}
