import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

/**
 * A quick-task run used to stop its sandbox on the way out; it now leaves it
 * up and records that with `markTaskSandboxActive` (2026-09-23), so the
 * reviewer lands on a live sandbox instead of waiting for a cold resume.
 *
 * That one field carries two failure modes, both silent. Not writing `active`
 * hides the running sandbox from `listActiveSandboxes`, so the daily idle
 * sweep never reaps it and every run leaks a VM. Writing it unconditionally
 * resurrects a sandbox that a mid-run Stop or watchdog recovery already tore
 * down, leaving the UI offering a Start button for a VM that is gone.
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;

const SANDBOX = "sbx-run";

async function fixture() {
  const t = convexTest(schema, modules);
  const taskId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: "clerk|runner" });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const now = Date.now();
    return ctx.db.insert("agentTasks", {
      title: "Ran once",
      status: "business_review" as const,
      repoId,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    });
  });
  return { t, taskId };
}

function task(t: ReturnType<typeof convexTest>, taskId: Id<"agentTasks">) {
  return t.run((ctx) => ctx.db.get(taskId));
}

describe("a quick-task run winding down", () => {
  test(
    "leaves the sandbox active and reachable by the idle sweep",
    async () => {
      const { t, taskId } = await fixture();
      await t.mutation(internal.taskWorkflow.markTaskSandboxActive, {
        taskId,
        sandboxId: SANDBOX,
      });

      const after = await task(t, taskId);
      expect(after?.reviewTaskSandboxStatus).toBe("active");
      expect(after?.sandboxId).toBe(SANDBOX);
      // The sweep is the only thing that reaps a VM the reviewer forgets
      // about, and it only looks at `active` tasks.
      const sweep = await t.query(internal.sandboxAutoStop.listActiveSandboxes);
      expect(sweep.taskIds).toEqual([taskId]);
    },
    TIMEOUT_MS,
  );

  test(
    "a run that never recorded its sandbox is invisible to the sweep",
    async () => {
      const { t } = await fixture();
      const sweep = await t.query(internal.sandboxAutoStop.listActiveSandboxes);
      expect(sweep.taskIds).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test.each([["stopping"], ["closed"]] as const)(
    "does not resurrect a sandbox that is already %s",
    async (status) => {
      const { t, taskId } = await fixture();
      await t.run((ctx) =>
        ctx.db.patch(taskId, {
          sandboxId: SANDBOX,
          reviewTaskSandboxStatus: status,
        }),
      );

      await t.mutation(internal.taskWorkflow.markTaskSandboxActive, {
        taskId,
        sandboxId: SANDBOX,
      });

      // A Stop mid-run, or watchdog recovery, must win over the run's
      // wind-down — otherwise the UI offers to open a VM that is gone.
      expect((await task(t, taskId))?.reviewTaskSandboxStatus).toBe(status);
    },
    TIMEOUT_MS,
  );

  test(
    "does not stamp a stale sandbox over a newer one",
    async () => {
      const { t, taskId } = await fixture();
      await t.run((ctx) =>
        ctx.db.patch(taskId, {
          sandboxId: "sbx-newer",
          reviewTaskSandboxStatus: "starting",
        }),
      );

      await t.mutation(internal.taskWorkflow.markTaskSandboxActive, {
        taskId,
        sandboxId: SANDBOX,
      });

      const after = await task(t, taskId);
      expect(after?.sandboxId).toBe("sbx-newer");
      expect(after?.reviewTaskSandboxStatus).toBe("starting");
    },
    TIMEOUT_MS,
  );

  test(
    "a task deleted mid-run is a no-op rather than a failure",
    async () => {
      const { t, taskId } = await fixture();
      await t.run((ctx) => ctx.db.delete(taskId));

      await expect(
        t.mutation(internal.taskWorkflow.markTaskSandboxActive, {
          taskId,
          sandboxId: SANDBOX,
        }),
      ).resolves.toBeNull();
    },
    TIMEOUT_MS,
  );
});
