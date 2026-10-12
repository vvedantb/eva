import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { isFirstTaskOnBranch } from "../convex/functions";

/**
 * Reported bug: closing a project's pull request wiped the project (fix
 * 51cdced9). One PR covers every task in a project, so the closed-PR webhook handler used
 * to walk `by_project` and force each task to done/cancelled — a single
 * "Close pull request" click on GitHub cancelled work that was still in
 * progress, and fanned a notification out per task. A close can be undone on
 * GitHub; the task statuses it overwrote cannot, so the blast radius is now
 * the project phase alone.
 *
 * Behavioural rather than source-level: the property that broke is what the
 * webhook leaves behind in the database, and the source-level rules that used
 * to guard this path silently went stale when the handler was restructured.
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;

const PROJECT_PR = "https://github.com/vvedantb/eva/pull/900";
const QUICK_TASK_PR = "https://github.com/vvedantb/eva/pull/901";

/**
 * A project of three tasks at three different points in its lifecycle, plus an
 * unrelated quick task. Ada subscribes to two of the project's tasks (so a
 * per-task fan-out would reach her twice), Bo to one, and Cy unsubscribed.
 */
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const ada = await ctx.db.insert("users", { clerkId: "clerk|ada" });
    const bo = await ctx.db.insert("users", { clerkId: "clerk|bo" });
    const cy = await ctx.db.insert("users", { clerkId: "clerk|cy" });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: ada,
    });
    const projectId = await ctx.db.insert("projects", {
      repoId,
      userId: ada,
      title: "Billing rewrite",
      rawInput: "rewrite billing",
      phase: "code_review",
      numId: 7,
      branchVersion: 2,
      branchName: "eva/project-billing-v2",
      prUrl: PROJECT_PR,
    });

    const now = Date.now();
    const task = (
      title: string,
      status: "todo" | "in_progress" | "done",
      numId: number,
      project: Id<"projects"> | undefined,
    ) =>
      ctx.db.insert("agentTasks", {
        title,
        status,
        numId,
        repoId,
        projectId: project,
        createdAt: now,
        updatedAt: now,
        createdBy: ada,
      });

    const shipped = await task("Shipped", "done", 1, projectId);
    const building = await task("Building", "in_progress", 2, projectId);
    const queued = await task("Queued", "todo", 3, projectId);
    const quick = await task("Standalone", "in_progress", 4, undefined);

    const subscribe = (taskId: Id<"agentTasks">, userId: Id<"users">) =>
      ctx.db.insert("taskSubscribers", {
        taskId,
        userId,
        subscribed: true,
        createdAt: now,
        updatedAt: now,
      });
    await subscribe(shipped, ada);
    await subscribe(building, ada);
    await subscribe(queued, bo);
    await ctx.db.insert("taskSubscribers", {
      taskId: queued, // muted this project, so nothing should reach Cy
      userId: cy,
      subscribed: false,
      createdAt: now,
      updatedAt: now,
    });
    await subscribe(quick, ada);

    const run = (taskId: Id<"agentTasks">) =>
      ctx.db.insert("agentRuns", {
        taskId,
        status: "success" as const,
        logs: [],
      });
    // The project's PR was opened by the task that ran first, not by all three.
    const shippedRun = await run(shipped);
    const quickRun = await run(quick);
    await ctx.db.insert("pullRequests", {
      repoId,
      prUrl: PROJECT_PR,
      prNumber: 900,
      headBranch: "eva/project-billing-v2",
      state: "open",
      primary: true,
      origin: "eva",
      owner: {
        kind: "project",
        projectId,
        taskId: shipped,
        runId: shippedRun,
      },
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("pullRequests", {
      repoId,
      prUrl: QUICK_TASK_PR,
      prNumber: 901,
      headBranch: `eva/task-${quick}`,
      state: "open",
      primary: true,
      origin: "eva",
      owner: { kind: "task", taskId: quick, runId: quickRun },
      createdAt: now,
      updatedAt: now,
    });

    return { ada, bo, cy, repoId, projectId, shipped, building, queued, quick };
  });
  return { t, ids };
}

function statuses(
  t: ReturnType<typeof convexTest>,
  taskIds: Id<"agentTasks">[],
) {
  return t.run(async (ctx) =>
    Promise.all(
      taskIds.map(async (taskId) => {
        const task = await ctx.db.get(taskId);
        return task?.status;
      }),
    ),
  );
}

function notificationsFor(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
) {
  return t.run(async (ctx) =>
    ctx.db
      .query("notifications")
      .filter((q) => q.eq(q.field("userId"), userId))
      .collect(),
  );
}

describe("a project pull request closing without merge", () => {
  test(
    "moves the project to cancelled and leaves every task alone",
    async () => {
      const { t, ids } = await fixture();
      await t.mutation(internal.githubWebhook.handlePullRequestEvent, {
        prUrl: PROJECT_PR,
        action: "closed",
        merged: false,
      });

      expect(
        await statuses(t, [ids.shipped, ids.building, ids.queued]),
        "a project PR is not a verdict on what each task did",
      ).toEqual(["done", "in_progress", "todo"]);
      const project = await t.run((ctx) => ctx.db.get(ids.projectId));
      expect(project?.phase).toBe("cancelled");
    },
    TIMEOUT_MS,
  );

  test(
    "notifies each subscriber once about the project, not once per task",
    async () => {
      const { t, ids } = await fixture();
      await t.mutation(internal.githubWebhook.handlePullRequestEvent, {
        prUrl: PROJECT_PR,
        action: "closed",
        merged: false,
      });

      // Ada subscribes to two of the three tasks; the old per-task loop sent
      // her one notification for each.
      const ada = await notificationsFor(t, ids.ada);
      expect(ada).toHaveLength(1);
      expect(ada[0].title).toContain('project "Billing rewrite"');
      // No taskId is set, so the click-through lands on the project rather
      // than whichever task happened to open the PR.
      expect(ada[0].href).toBe("/vvedantb/eva/projects/7");

      expect(await notificationsFor(t, ids.bo)).toHaveLength(1);
      expect(
        await notificationsFor(t, ids.cy),
        "an unsubscribed member stays unsubscribed",
      ).toHaveLength(0);
    },
    TIMEOUT_MS,
  );
});

describe("a project pull request merging", () => {
  test(
    "completes the project and still leaves task statuses untouched",
    async () => {
      const { t, ids } = await fixture();
      await t.mutation(internal.githubWebhook.handlePullRequestEvent, {
        prUrl: PROJECT_PR,
        action: "closed",
        merged: true,
      });

      expect(
        await statuses(t, [ids.shipped, ids.building, ids.queued]),
      ).toEqual(["done", "in_progress", "todo"]);
      const project = await t.run((ctx) => ctx.db.get(ids.projectId));
      expect(project?.phase).toBe("completed");
      // The merged branch is spent: the next build needs a fresh one. The old
      // PR stays linked as history, but no longer sits on the live branch, so
      // the next run opens a new PR instead of refreshing it.
      expect(project?.branchVersion).toBe(3);
      expect(project?.branchName).not.toBe("eva/project-billing-v2");
      expect(project?.prState).toBe("merged");
      const firstOnBranch = await t.run((ctx) =>
        isFirstTaskOnBranch(ctx.db, ids.building, ids.projectId),
      );
      expect(firstOnBranch).toBe(true);
    },
    TIMEOUT_MS,
  );

  test(
    "records the merge on the timeline of the task that opened the PR",
    async () => {
      const { t, ids } = await fixture();
      await t.mutation(internal.githubWebhook.handlePullRequestEvent, {
        prUrl: PROJECT_PR,
        action: "closed",
        merged: true,
      });

      const activity = await t.run((ctx) =>
        ctx.db.query("taskActivity").collect(),
      );
      expect(activity.map((entry) => entry.taskId)).toEqual([ids.shipped]);
      expect(activity[0].newValue).toBe("merged");
    },
    TIMEOUT_MS,
  );
});

/**
 * The quick-task half of the same handler, which does still follow the PR: one
 * task, one PR, and no sibling tasks to damage.
 */
describe("a quick task's pull request", () => {
  test(
    "moves the task to done on merge without touching the project's tasks",
    async () => {
      const { t, ids } = await fixture();
      await t.mutation(internal.githubWebhook.handlePullRequestEvent, {
        prUrl: QUICK_TASK_PR,
        action: "closed",
        merged: true,
      });

      expect(await statuses(t, [ids.quick])).toEqual(["done"]);
      expect(
        await statuses(t, [ids.shipped, ids.building, ids.queued]),
      ).toEqual(["done", "in_progress", "todo"]);
      const notifications = await notificationsFor(t, ids.ada);
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toContain('"Standalone" moved to done');
    },
    TIMEOUT_MS,
  );

  test(
    "moves the task to cancelled when the PR is closed unmerged",
    async () => {
      const { t, ids } = await fixture();
      await t.mutation(internal.githubWebhook.handlePullRequestEvent, {
        prUrl: QUICK_TASK_PR,
        action: "closed",
        merged: false,
      });

      expect(await statuses(t, [ids.quick])).toEqual(["cancelled"]);
    },
    TIMEOUT_MS,
  );

  test(
    "closes a preview sandbox the task never started",
    async () => {
      const { t, ids } = await fixture();
      await t.run((ctx) =>
        ctx.db.patch(ids.quick, { reviewTaskSandboxStatus: "active" }),
      );

      await t.mutation(internal.githubWebhook.handlePullRequestEvent, {
        prUrl: QUICK_TASK_PR,
        action: "closed",
        merged: true,
      });

      // A merged PR makes the task read-only, so its preview must not stay
      // startable. (The stop of a *live* VM schedules provider teardown, so
      // that half is asserted at source level in taskPrLifecycleContract.)
      const task = await t.run((ctx) => ctx.db.get(ids.quick));
      expect(task?.reviewTaskSandboxStatus).toBe("closed");
    },
    TIMEOUT_MS,
  );

  test(
    "skips a task that already reached a terminal status",
    async () => {
      const { t, ids } = await fixture();
      await t.run((ctx) => ctx.db.patch(ids.quick, { status: "done" }));

      await t.mutation(internal.githubWebhook.handlePullRequestEvent, {
        prUrl: QUICK_TASK_PR,
        action: "closed",
        merged: false,
      });

      expect(
        await statuses(t, [ids.quick]),
        "a closed PR must not undo a task that is already done",
      ).toEqual(["done"]);
      expect(await notificationsFor(t, ids.ada)).toHaveLength(0);
      const events = await t.run((ctx) =>
        ctx.db.query("githubWebhookEvents").collect(),
      );
      expect(events.map((event) => event.status)).toEqual(["skipped"]);
    },
    TIMEOUT_MS,
  );
});

describe("a quick task holding two pull requests", () => {
  const SECOND_PR = "https://github.com/vvedantb/eva/pull/902";

  test(
    "stays put until its last PR lands, then follows the merge",
    async () => {
      const { t, ids } = await fixture();
      await t.mutation(internal.githubWebhook.handlePullRequestEvent, {
        prUrl: SECOND_PR,
        action: "opened",
        headBranch: `eva/task-${ids.quick}-split`,
        repoOwner: "vvedantb",
        repoName: "eva",
        headInSameRepo: true,
      });

      await t.mutation(internal.githubWebhook.handlePullRequestEvent, {
        prUrl: QUICK_TASK_PR,
        action: "closed",
        merged: false,
      });
      expect(
        await statuses(t, [ids.quick]),
        "the second PR is still open",
      ).toEqual(["in_progress"]);

      await t.mutation(internal.githubWebhook.handlePullRequestEvent, {
        prUrl: SECOND_PR,
        action: "closed",
        merged: true,
      });
      expect(await statuses(t, [ids.quick])).toEqual(["done"]);
      const task = await t.run((ctx) => ctx.db.get(ids.quick));
      expect(task?.prCount).toBe(2);
      expect(task?.prUrl).toBe(QUICK_TASK_PR);
    },
    TIMEOUT_MS,
  );
});
