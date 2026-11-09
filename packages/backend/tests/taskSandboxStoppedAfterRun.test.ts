import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

/**
 * A quick-task run stops (does not delete) its sandbox on the way out, so a
 * task nobody is reviewing is not left holding a live VM. `sandboxId` stays on
 * the task so Start Sandbox and follow-up runs resume the same paused
 * filesystem rather than bootstrapping a fresh one.
 *
 * The two ways this goes wrong are both silent: stopping a sandbox the
 * reviewer already has open pulls the preview out from under them mid-session,
 * and not stopping one at all leaks a VM per run.
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
      sandboxId: SANDBOX,
      reviewTaskSandboxStatus: "active" as const,
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
    "records the sandbox as closed but keeps it resumable",
    async () => {
      const { t, taskId } = await fixture();
      await t.mutation(internal.taskWorkflow.markTaskSandboxStopped, {
        taskId,
      });

      const after = await task(t, taskId);
      expect(after?.reviewTaskSandboxStatus).toBe("closed");
      // Dropping the id here would strand the paused filesystem and force the
      // reviewer to bootstrap a brand new sandbox.
      expect(after?.sandboxId).toBe(SANDBOX);
    },
    TIMEOUT_MS,
  );

  test(
    "leaves nothing for the idle auto-stop sweep to reap",
    async () => {
      const { t, taskId } = await fixture();
      await t.mutation(internal.taskWorkflow.markTaskSandboxStopped, {
        taskId,
      });

      const sweep = await t.query(internal.sandboxAutoStop.listActiveSandboxes);
      expect(sweep.taskIds).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    "a task deleted mid-run is a no-op rather than a failure",
    async () => {
      const { t, taskId } = await fixture();
      await t.run((ctx) => ctx.db.delete(taskId));

      await expect(
        t.mutation(internal.taskWorkflow.markTaskSandboxStopped, { taskId }),
      ).resolves.toBeNull();
    },
    TIMEOUT_MS,
  );
});
