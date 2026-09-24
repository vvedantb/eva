import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");

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

describe("the workflow only stops sandboxes it is safe to stop", () => {
  const workflow = readSource("_taskWorkflow/workflowDefinition.ts");

  test.each([
    ["!args.projectId", "a project sandbox outlives any one of its tasks"],
    ["!preserveSandboxOnFailure", "a failed publish keeps its evidence"],
    [
      "!keepTaskSandboxActiveAfterRun",
      "a preview the reviewer already has open stays up",
    ],
  ])("the stop is gated on %s so %s", (clause) => {
    const stopAt = workflow.indexOf("internal.sandbox.stopSandbox");
    expect(stopAt, "the sandbox stop moved or was renamed").toBeGreaterThan(-1);
    expect(workflow.slice(0, stopAt)).toContain(clause);
  });

  test("the PR description is generated before the sandbox goes down", () => {
    const describeAt = workflow.indexOf("internal.github.generatePrDescription");
    const stopAt = workflow.indexOf("internal.sandbox.stopSandbox");
    expect(describeAt).toBeGreaterThan(-1);
    // It reads the diff off that sandbox, so the order is load-bearing.
    expect(stopAt).toBeGreaterThan(describeAt);
  });

  test("an already-open preview is what sets the keep flag", () => {
    const queries = readSource("_taskWorkflow/queries.ts");
    expect(queries).toContain(
      'const keepTaskSandboxActiveAfterRun =\n      !args.projectId && task.reviewTaskSandboxStatus === "active";',
    );
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

function stripComments(input: string): string {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
