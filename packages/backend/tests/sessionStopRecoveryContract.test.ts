import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");

const sandboxSource = readSource("_sessions/sandbox.ts");
const stopRecoverySource = readSource("_sandbox/stopRecovery.ts");
const startupSource = readSource("_sandbox_runtime/sessions.ts");
const lifecycleSource = readSource("_sandbox_runtime/lifecycle.ts");

/**
 * The three entities that own a sandbox. Sessions had the pairing below first;
 * tasks and projects went without it until prod project 3 sat on `"stopping"`
 * indefinitely (18 Aug 2026, fix 67b0826e), so the invariant is asserted per
 * entity rather than on the session path alone.
 */
const stopPaths = [
  {
    entity: "session",
    module: "_sessions/sandbox.ts",
    schedulerDeclaration: "export async function scheduleFinalizeStop(",
    finalizeRef: "internal._sessions.sandbox.finalizeStopSandbox",
    recoverRef: "internal._sessions.sandbox.recoverStuckStopping",
    stoppingGuard: 'session.status !== "stopping"',
  },
  {
    entity: "task",
    module: "_agentTasks/sandbox.ts",
    schedulerDeclaration: "export async function scheduleFinalizeStopTask(",
    finalizeRef: "internal._agentTasks.sandbox.finalizeStopTaskSandbox",
    recoverRef: "internal._agentTasks.sandbox.recoverStuckStopping",
    stoppingGuard: 'task.reviewTaskSandboxStatus !== "stopping"',
  },
  {
    entity: "project",
    module: "_projects/sandbox.ts",
    schedulerDeclaration: "export async function scheduleFinalizeStopProject(",
    finalizeRef: "internal._projects.sandbox.finalizeStopProjectSandbox",
    recoverRef: "internal._projects.sandbox.recoverStuckStopping",
    stoppingGuard: 'project.reviewProjectSandboxStatus !== "stopping"',
  },
] as const;

/**
 * Convex does not auto-retry actions. A "Transient error while executing action"
 * on the finalize action therefore left the entity on `"stopping"` forever,
 * with no button that could recover it (fix 37cdeb0b, generalised in 67b0826e).
 * The fix pairs every stop with a delayed re-issue, so the invariant is about
 * *pairing*, not about either schedule on its own.
 */
describe.each(stopPaths)(
  "every $entity stop schedules its own recovery",
  (path) => {
    const source = readSource(path.module);
    const scheduler = functionBody(source, path.schedulerDeclaration);

    test("issues the finalize immediately", () => {
      expect(scheduler).toContain(path.finalizeRef);
      expect(scheduler).toContain("await ctx.scheduler.runAfter(\n    0,");
    });

    test("issues a delayed recovery alongside it", () => {
      expect(scheduler).toContain(path.recoverRef);
      expect(scheduler).toContain("STUCK_STOPPING_RECOVER_MS");
    });

    /**
     * The gap this test was written for: idle auto-stop set `"stopping"` and
     * scheduled the finalize itself, so a transient wedged it with no recovery.
     */
    test("nothing schedules the finalize outside its own module", () => {
      const callers = convexFiles()
        .filter((file) => file !== path.module)
        .filter((file) => readSource(file).includes(path.finalizeRef));
      expect(
        callers,
        `schedule stops via ${path.schedulerDeclaration.slice("export async function ".length)}) instead`,
      ).toEqual([]);
    });

    /**
     * Same rule inside the module, which is where the wedge actually came from:
     * the user Stop mutation and the auto-stop sweep must both go through the
     * scheduler helper, so the only two places that name the finalize are that
     * helper and the recovery that re-issues it.
     */
    test("only the scheduler and its recovery reach the finalize", () => {
      const occurrences = source.split(path.finalizeRef).length - 1;
      expect(
        occurrences,
        "a stop path is scheduling the finalize without pairing a recovery",
      ).toBe(2);
    });

    /** Recovery has to be a no-op once the stop it backstops has landed. */
    test("recovery only fires while the entity is still stopping", () => {
      const body = definitionBody(source, "recoverStuckStopping");
      const guardAt = body.indexOf(path.stoppingGuard);
      expect(
        guardAt,
        "the stopping guard moved or was renamed",
      ).toBeGreaterThan(-1);
      expect(body.indexOf("return null;", guardAt)).toBeLessThan(
        body.indexOf("ctx.scheduler.runAfter("),
      );
    });
  },
);

/**
 * A zero delay would race the finalize it is meant to backstop. Sessions, tasks
 * and projects share one constant, so it is declared in `_sandbox` rather than
 * in any one of their modules — and each of them has to use that one.
 */
describe("the recovery delay is shared and non-zero", () => {
  test("waits before re-issuing", () => {
    const declaration = stopRecoverySource.match(
      /const STUCK_STOPPING_RECOVER_MS = ([\d_]+);/,
    );
    expect(
      declaration,
      "the recovery delay moved or was renamed",
    ).not.toBeNull();
    expect(Number(declaration?.[1].replaceAll("_", ""))).toBeGreaterThan(0);
  });

  test.each(stopPaths)("$entity imports it rather than its own", (path) => {
    expect(readSource(path.module)).toContain(
      'STUCK_STOPPING_RECOVER_MS } from "',
    );
  });
});

/**
 * Recovery above only unwedges the *entity*; the VM still has to be told to
 * stop. On a sandbox Vercel could no longer reach, the pre-stop refresh and
 * swap-release exec hung until the whole budget was gone, so `stop()` — a fast
 * control-plane call — was never issued and every attempt timed out (fix
 * d8c53fa). Only `stop()` is load-bearing: everything before it is an
 * optimisation, so each step is bounded and best-effort.
 */
describe("an unreachable VM cannot stop the stop from being issued", () => {
  const body = definitionBody(lifecycleSource, "stopSandbox");
  const dense = withoutWhitespace(body);

  /** The calling finalize shares the 600s action cap and needs its catch to run. */
  test("the attempt as a whole stays under the action cap", () => {
    expect(dense).toContain("STOP_SANDBOX_BUDGET_MS");
    expect(constant(lifecycleSource, "STOP_SANDBOX_BUDGET_MS")).toBeLessThan(
      600_000,
    );
  });

  test.each([
    ["refresh", "withTimeout(sandbox.refresh(),REFRESH_BUDGET_MS"],
    [
      "swap release",
      "withTimeout(releaseSwapFile(sandbox),SWAP_RELEASE_BUDGET_MS",
    ],
  ])("the pre-stop %s is bounded on its own", (_label, call) => {
    expect(dense).toContain(call);
  });

  /** Half the budget is reserved for the stop and its confirmation. */
  test("the pre-stop steps cannot claim most of the budget", () => {
    const preStop =
      constant(lifecycleSource, "REFRESH_BUDGET_MS") +
      constant(lifecycleSource, "SWAP_RELEASE_BUDGET_MS");
    expect(preStop).toBeLessThanOrEqual(
      constant(lifecycleSource, "STOP_SANDBOX_BUDGET_MS") / 2,
    );
  });

  test("neither pre-stop step can skip the stop", () => {
    const stopAt = dense.indexOf("awaitsandbox.stop()");
    expect(stopAt, "the stop call moved").toBeGreaterThan(-1);
    const preStop = dense.slice(0, stopAt);
    // Both steps log and fall through; a rethrow here would skip the stop.
    expect(preStop.match(/catch\(/g) ?? []).toHaveLength(2);
    expect(preStop).not.toContain("throw");
    // The swap release is skipped unless the VM is known to be running, so a
    // failed refresh must leave a state that still falls through to the stop.
    expect(preStop, "a failed refresh must not gate the stop").toContain(
      'letstate="unknown"',
    );
  });

  /** The one call whose failure has to reach the caller. */
  test("the stop itself still propagates", () => {
    expect(dense.slice(dense.indexOf("awaitsandbox.stop()"))).toContain(
      "throwerror",
    );
  });

  /**
   * A sandbox the provider has dropped answers every call with a bare 404, and
   * the SDK's message is only the status line — no "not found", no "gone". The
   * message-only benign check therefore never matched it, so finalize reverted
   * the entity to "active" and Stop could never succeed (prod, 23 Sep 2026:
   * quick task 107 logged nine straight `stop_failed` on a 404). The structured
   * classifier is what makes that case closable.
   */
  test("a provider 404 counts as already stopped", () => {
    expect(dense).toContain("isSandboxGoneError(error)");
    const benignAt = dense.indexOf("constbenign=");
    expect(benignAt, "the benign gate moved or was renamed").toBeGreaterThan(-1);
    expect(dense.indexOf("isSandboxGoneError(error)")).toBeGreaterThan(
      benignAt,
    );
  });
});

/**
 * Early-ready hands the user a live sandbox before startup has finished. A late
 * step failing after that point used to run the ordinary start-failure path,
 * which stops the VM and closes the session — deleting sandboxes out from under
 * users who were already mid-conversation (fix 2a0e08e5).
 */
describe("a startup failure after early-ready keeps the sandbox", () => {
  const warning = definitionBody(sandboxSource, "sandboxStartupWarning");

  test("records the failure as a message", () => {
    expect(warning).toContain('ctx.db.insert("messages"');
  });

  test.each([
    ["patch the session", "ctx.db.patch("],
    ["close the session", 'status: "closed"'],
    ["stop the sandbox", "stopSandbox"],
    ["mark processes exited", "markAllRunningExited"],
  ])("does not %s", (_label, call) => {
    expect(warning).not.toContain(call);
  });

  /** Session 125: stop raced reuse, the watcher posted this 6 minutes later. */
  test("no-ops unless the session is still active", () => {
    const guardAt = warning.indexOf('session.status !== "active"');
    expect(guardAt, "the active-status guard moved").toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(warning.indexOf('ctx.db.insert("messages"'));
  });

  /** Its destructive sibling still exists — the two must not converge. */
  test("sandboxError still closes the session", () => {
    const body = definitionBody(sandboxSource, "sandboxError");
    expect(body).toContain('status: "closed"');
  });

  test("post-ready setup failures warn instead of tearing down", () => {
    const block = blockBody(startupSource, "if (earlyReadyEmitted) {");
    expect(block).toContain("internal.sessions.sandboxStartupWarning");
    expect(block).not.toContain("internal.sessions.sandboxError");
    expect(block).not.toContain("internal.sandbox.stopSandbox");
  });

  /**
   * The outer safety net: even a wholesale start failure must leave an already
   * active session alone, and must return before reaching the teardown below it.
   */
  test("an active session with a sandbox is left running", () => {
    const guardAt = startupSource.indexOf(
      'sessionAfter.status === "active" &&',
    );
    expect(guardAt, "the early-ready safety net moved").toBeGreaterThan(-1);
    const teardownAt = startupSource.indexOf(
      "internal.sandbox.stopSandbox",
      guardAt,
    );
    expect(teardownAt, "the no-early-ready teardown moved").toBeGreaterThan(
      guardAt,
    );
    const branch = startupSource.slice(guardAt, teardownAt);
    expect(branch).toContain("internal.sessions.sandboxStartupWarning");
    expect(branch).toContain("return null;");
  });
});

/**
 * Stop can land after early-ready. Reuse used to keep launching Convex and the
 * preview server, then a 6-minute readiness watcher posted "startup unfinished"
 * into the closed chat (session 125).
 */
describe("a stop that races reuse does not warn about unfinished startup", () => {
  const executionSource = readSource("_sandbox_runtime/execution.ts");

  test("the Convex readiness watcher stops once the session no longer owns the VM", () => {
    const body = definitionBody(executionSource, "watchConvexReadiness");
    expect(body).toContain("sessionStillRunningSandbox");
    expect(body).toContain("isSandboxGoneError");
    const warnAt = body.indexOf("internal.sessions.sandboxStartupWarning");
    expect(warnAt, "the timeout warning moved").toBeGreaterThan(-1);
    expect(
      body.lastIndexOf("sessionStillRunningSandbox", warnAt),
      "timeout must re-check ownership before warning",
    ).toBeGreaterThan(-1);
  });

  test("reuse start aborts before launching daemons if stop was requested", () => {
    const prepareAt = startupSource.indexOf(
      '"reuseSessionSandbox.prepare"',
    );
    const backgroundAt = startupSource.indexOf(
      '"reuseSessionSandbox.runBackgroundCommands"',
    );
    const launchAt = startupSource.indexOf(
      '"reuseSessionSandbox.launchDevServer"',
    );
    expect(prepareAt, "reuse prepare step moved").toBeGreaterThan(-1);
    expect(backgroundAt, "reuse background step moved").toBeGreaterThan(
      prepareAt,
    );
    expect(launchAt, "reuse launch step moved").toBeGreaterThan(backgroundAt);
    expect(startupSource).toContain("abortReuseIfSessionStopped");
    expect(
      startupSource.slice(prepareAt, backgroundAt),
      "stop must abort before background commands",
    ).toContain("abortReuseIfSessionStopped");
    expect(
      startupSource.slice(backgroundAt, launchAt),
      "stop must abort before the preview server launch",
    ).toContain("abortReuseIfSessionStopped");
  });
});

/**
 * Comments name the very calls these rules rule out, so they have to go first.
 * Newlines are normalised so multi-line assertions do not depend on checkout
 * line endings.
 */
function readSource(relativePath: string): string {
  return stripComments(
    readFileSync(join(convexDir, relativePath), "utf8").replaceAll(
      "\r\n",
      "\n",
    ),
  );
}

function convexFiles(): string[] {
  return readdirSync(convexDir, { recursive: true })
    .map((entry) => String(entry).replaceAll("\\", "/"))
    .filter((path) => path.endsWith(".ts"))
    .filter((path) => !path.includes("_generated"));
}

/** Slices from a declaration to the next top-level one. */
function functionBody(source: string, declaration: string): string {
  const startAt = source.indexOf(declaration);
  expect(startAt, `${declaration} moved or was renamed`).toBeGreaterThan(-1);
  const nextAt = source.indexOf("\nexport ", startAt + 1);
  return source.slice(startAt, nextAt < 0 ? undefined : nextAt);
}

/** One Convex definition, ending on the `\n});` that closes it. */
function definitionBody(source: string, name: string): string {
  const startAt = source.indexOf(`export const ${name} =`);
  expect(startAt, `${name} moved or was renamed`).toBeGreaterThan(-1);
  const end = source.indexOf("\n});", startAt);
  return source.slice(startAt, end < 0 ? undefined : end);
}

/**
 * One braced block, matched by counting braces from its opening line. Needed
 * because this block sits mid-function, so no `export`/`});` boundary applies.
 */
function blockBody(source: string, opener: string): string {
  const startAt = source.indexOf(opener);
  expect(startAt, `${opener} moved or was renamed`).toBeGreaterThan(-1);
  let depth = 0;
  for (let at = startAt + opener.length - 1; at < source.length; at += 1) {
    if (source[at] === "{") depth += 1;
    if (source[at] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(startAt, at + 1);
    }
  }
  throw new Error(`unterminated block at ${opener}`);
}

/** A numeric top-level constant, underscores and all. */
function constant(source: string, name: string): number {
  const declaration = source.match(new RegExp(`const ${name} = ([\\d_]+);`));
  expect(declaration, `${name} moved or was renamed`).not.toBeNull();
  return Number(declaration?.[1].replaceAll("_", ""));
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
