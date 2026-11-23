import { convexTest } from "convex-test";
import workflow from "@convex-dev/workflow/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import {
  MAX_PARALLEL_PROJECT_TASKS,
  projectTaskDisplayStatus,
  projectTaskNeedsYou,
} from "@eva/shared/projectStatus";
import { sessionSandboxProfile } from "../convex/_sessions/owner";
import { COORDINATOR_VCPUS } from "../convex/_sandbox/provider";

/**
 * The project as an orchestrator, through the real Convex functions: the
 * scheduler and its cap, the coordinator's tasks (start at once) against
 * feedback (waits in Triage), the coordinator's one retry and its wake-ups,
 * the project's repo list, locked rows, the roll-up of docs, artifacts and
 * log, the copy of the project's model and account, the coordinator's
 * delete rule, project delete, and the coordinator's sandbox.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|project-scheduler";
const OTHER_CLERK_ID = "clerk|project-scheduler-other";

// Runs start workflows; keep their steps from running after the test.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
});

async function fixture(taskCount: number) {
  const t = convexTest(schema, modules);
  workflow.register(t);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const otherUserId = await ctx.db.insert("users", { clerkId: OTHER_CLERK_ID });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    // A repo the user can open that is not on the project's list.
    const outsideRepoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "outside",
      installationId: 1,
      connectedBy: userId,
    });
    // On the project's list, but only the other user can open it.
    const lockedRepoId = await ctx.db.insert("githubRepos", {
      owner: "someone",
      name: "private",
      installationId: 2,
      connectedBy: otherUserId,
    });
    const projectId = await ctx.db.insert("projects", {
      repoId,
      userId,
      title: "Project",
      rawInput: "Project",
      phase: "business_review",
      extraRepoIds: [lockedRepoId],
      numId: 1,
    });
    const tasks: Id<"agentTasks">[] = [];
    for (let i = 1; i <= taskCount; i += 1) {
      tasks.push(
        await ctx.db.insert("agentTasks", {
          repoId,
          projectId,
          title: `Task ${i}`,
          taskNumber: i,
          status: "todo",
          approvedAt: 1,
          numId: i,
          createdAt: 0,
          updatedAt: 0,
          createdBy: userId,
        }),
      );
    }
    return { userId, otherUserId, repoId, outsideRepoId, lockedRepoId, projectId, tasks };
  });
  return { t, asUser: t.withIdentity({ subject: CLERK_ID }), ...ids };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

const schedule = (f: Fixture) =>
  f.t.mutation(internal.buildWorkflow.scheduleReadyTasks, {
    projectId: f.projectId,
  });

const taskDoc = (f: Fixture, id: Id<"agentTasks">) =>
  f.t.run(async (ctx) => {
    const task = await ctx.db.get(id);
    if (!task) throw new Error("task missing");
    return task;
  });

const statuses = (f: Fixture, ids: readonly Id<"agentTasks">[]) =>
  Promise.all(ids.map(async (id) => (await taskDoc(f, id)).status));

const factsOf = async (f: Fixture, taskId: Id<"agentTasks">) => {
  const rows = await f.asUser.query(api.agentTasks.listByProject, {
    projectId: f.projectId,
  });
  const facts = rows.find((row) => row._id === taskId)?.facts;
  if (!facts) throw new Error("facts missing");
  return facts;
};

/** The task's latest run ended in an error and it went back to todo. */
async function failLatestRun(f: Fixture, taskId: Id<"agentTasks">) {
  return f.t.run(async (ctx) => {
    const runs = await ctx.db
      .query("agentRuns")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();
    let runId = runs.at(-1)?._id;
    if (runId === undefined) {
      runId = await ctx.db.insert("agentRuns", {
        taskId,
        repoId: f.repoId,
        status: "error",
        logs: [],
        startedAt: Date.now() - 1_000,
        error: "Tests failed",
      });
    }
    for (const run of runs) {
      await ctx.db.patch(run._id, { status: "error", error: "Tests failed" });
    }
    await ctx.db.patch(taskId, { status: "todo", run: undefined });
    return runId;
  });
}

/** The run ended and the task sits done with its PR in `prState`. */
async function finishTask(
  f: Fixture,
  taskId: Id<"agentTasks">,
  prState: "open" | "merged",
) {
  await f.t.run(async (ctx) => {
    await ctx.db.patch(taskId, { status: "done", prState, run: undefined });
    for (const run of await ctx.db
      .query("agentRuns")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect()) {
      await ctx.db.patch(run._id, { status: "success" });
    }
  });
}

describe("project scheduler", () => {
  test(
    `starts at most ${MAX_PARALLEL_PROJECT_TASKS} approved tasks, in task number order, each on its own session`,
    async () => {
      const f = await fixture(5);
      await schedule(f);
      expect(await statuses(f, f.tasks)).toEqual([
        "in_progress",
        "in_progress",
        "in_progress",
        "todo",
        "todo",
      ]);
      const owners = await f.t.run(async (ctx) =>
        (await ctx.db.query("sessions").collect()).map((s) => s.owner),
      );
      expect(owners).toHaveLength(MAX_PARALLEL_PROJECT_TASKS);
      expect(owners.every((owner) => owner.kind === "task")).toBe(true);

      // A second call on the same state starts nothing.
      await schedule(f);
      expect(await statuses(f, f.tasks)).toEqual([
        "in_progress",
        "in_progress",
        "in_progress",
        "todo",
        "todo",
      ]);

      // One ends: the next by number takes its slot.
      await finishTask(f, f.tasks[0], "open");
      await schedule(f);
      expect(await statuses(f, f.tasks)).toEqual([
        "done",
        "in_progress",
        "in_progress",
        "in_progress",
        "todo",
      ]);
    },
    TIMEOUT_MS,
  );

  test(
    "a task run copies the project's model and account at its start",
    async () => {
      const f = await fixture(1);
      const accountId = await f.t.run(async (ctx) => {
        const accountId = await ctx.db.insert("userProviderAccounts", {
          userId: f.userId,
          provider: "claude",
          label: "Project account",
          credentials: [],
          createdAt: 0,
          updatedAt: 0,
        });
        await ctx.db.patch(f.projectId, {
          model: "claude:opus",
          providerAccountId: accountId,
        });
        await ctx.db.patch(f.tasks[0], { model: "claude:sonnet" });
        return accountId;
      });
      await schedule(f);
      const task = await taskDoc(f, f.tasks[0]);
      expect(task.status).toBe("in_progress");
      expect(task.model).toBe("claude:opus");
      expect(task.providerAccountId).toBe(accountId);
    },
    TIMEOUT_MS,
  );
});

describe("who starts project tasks", () => {
  test(
    "the coordinator's tasks are approved and the scheduler runs at once; feedback waits in Triage",
    async () => {
      const f = await fixture(0);
      const created = await f.t.mutation(
        internal._projects.batches.createTasksFromCoordinator,
        {
          projectId: f.projectId,
          userId: f.userId,
          tasks: [{ title: "API" }, { title: "UI" }],
        },
      );
      const coordinatorTasks = await Promise.all(
        created.taskIds.map((id) => taskDoc(f, id)),
      );
      expect(coordinatorTasks.every((task) => task.approvedAt !== undefined)).toBe(true);
      const scheduled = await f.t.run((ctx) =>
        ctx.db.system.query("_scheduled_functions").collect(),
      );
      expect(scheduled.map((job) => job.name)).toContain(
        "buildWorkflow:scheduleReadyTasks",
      );
      await schedule(f);
      expect(await statuses(f, created.taskIds)).toEqual([
        "in_progress",
        "in_progress",
      ]);

      const feedbackId = await f.asUser.mutation(api.agentTasks.createFeedbackTask, {
        projectId: f.projectId,
        text: "The button is hard to find",
      });
      await schedule(f);
      const feedback = await taskDoc(f, feedbackId);
      expect(feedback.status).toBe("todo");
      expect(feedback.approvedAt).toBeUndefined();
      expect(feedback.origin).toBe("feedback");
      expect(projectTaskDisplayStatus(await factsOf(f, feedbackId))).toBe("triage");

      // A person approves it from Triage: it starts.
      await f.asUser.mutation(api.buildWorkflow.approveProjectTasks, {
        projectId: f.projectId,
        taskIds: [feedbackId],
      });
      expect((await taskDoc(f, feedbackId)).status).toBe("in_progress");
    },
    TIMEOUT_MS,
  );

  test(
    "the coordinator cannot create a task in a repo that is not on the project's list",
    async () => {
      const f = await fixture(0);
      await expect(
        f.t.mutation(internal._projects.batches.createTasksFromCoordinator, {
          projectId: f.projectId,
          userId: f.userId,
          tasks: [{ title: "Home" }, { title: "Elsewhere", repoId: f.outsideRepoId }],
        }),
      ).rejects.toThrow("not part of the project");
      // Checked before any task is written.
      const tasks = await f.t.run((ctx) => ctx.db.query("agentTasks").collect());
      expect(tasks).toEqual([]);
    },
    TIMEOUT_MS,
  );
});

describe("the coordinator's retry and wake-ups", () => {
  test(
    "a first failure wakes the coordinator, which may retry once; a second failure needs a person",
    async () => {
      const f = await fixture(1);
      const [taskId] = f.tasks;
      const runId = await failLatestRun(f, taskId);
      await schedule(f);
      expect(projectTaskNeedsYou(await factsOf(f, taskId))).toBeUndefined();
      const wakes = await f.t.run((ctx) =>
        ctx.db.query("projectCoordinatorWakes").collect(),
      );
      expect(wakes.map((wake) => [wake.reason, wake.key])).toEqual([
        ["failed", `failed:${runId}`],
      ]);

      await f.t.mutation(internal.buildWorkflow.retryFailedTaskAsCoordinator, {
        projectId: f.projectId,
        taskId,
        note: "Fix the flaky test first.",
      });
      const retried = await taskDoc(f, taskId);
      expect(retried.status).toBe("in_progress");
      expect(retried.coordinatorRetries).toBe(1);

      await failLatestRun(f, taskId);
      await schedule(f);
      expect(projectTaskNeedsYou(await factsOf(f, taskId))).toBe("failed");
      // No wake-up for a failure the coordinator may not retry.
      const after = await f.t.run((ctx) =>
        ctx.db.query("projectCoordinatorWakes").collect(),
      );
      expect(after).toHaveLength(1);
      await expect(
        f.t.mutation(internal.buildWorkflow.retryFailedTaskAsCoordinator, {
          projectId: f.projectId,
          taskId,
          note: "Again.",
        }),
      ).rejects.toThrow("already retried");
    },
    TIMEOUT_MS,
  );

  test(
    "a batch whose tasks all ended wakes the coordinator once",
    async () => {
      const f = await fixture(2);
      const batchId = await f.t.run((ctx) =>
        ctx.db.insert("projectTaskBatches", {
          projectId: f.projectId,
          taskIds: f.tasks,
          createdAt: 0,
        }),
      );
      await schedule(f);
      await finishTask(f, f.tasks[0], "merged");
      await schedule(f);
      const batchWakes = async () =>
        (await f.t.run((ctx) => ctx.db.query("projectCoordinatorWakes").collect()))
          .filter((wake) => wake.reason === "batch_done")
          .map((wake) => wake.key);
      expect(await batchWakes()).toEqual([]);

      await finishTask(f, f.tasks[1], "merged");
      await schedule(f);
      await schedule(f);
      expect(await batchWakes()).toEqual([`batch:${batchId}`]);
    },
    TIMEOUT_MS,
  );
});

describe("the project's rows across repos", () => {
  test(
    "a task in a repo the reader cannot open is a locked row",
    async () => {
      const f = await fixture(1);
      const lockedTaskId = await f.t.run((ctx) =>
        ctx.db.insert("agentTasks", {
          repoId: f.lockedRepoId,
          projectId: f.projectId,
          title: "Secret",
          taskNumber: 2,
          status: "todo",
          approvedAt: 1,
          numId: 1,
          createdAt: 0,
          updatedAt: 0,
          createdBy: f.otherUserId,
        }),
      );
      const rows = await f.t.query(internal.mcp.projectQueries.projectTaskTable, {
        projectId: f.projectId,
        userId: f.userId,
      });
      expect(rows).toEqual([
        expect.objectContaining({ locked: false, taskId: f.tasks[0], title: "Task 1" }),
        { locked: true, taskId: lockedTaskId },
      ]);
    },
    TIMEOUT_MS,
  );

  test(
    "the project's docs, artifacts and log roll up its child tasks' rows the reader can open",
    async () => {
      const f = await fixture(1);
      const [childId] = f.tasks;
      await f.t.run(async (ctx) => {
        const lockedTaskId = await ctx.db.insert("agentTasks", {
          repoId: f.lockedRepoId,
          projectId: f.projectId,
          title: "Secret",
          taskNumber: 2,
          status: "todo",
          numId: 1,
          createdAt: 0,
          updatedAt: 0,
          createdBy: f.otherUserId,
        });
        const sources: Array<
          [string, Pick<Doc<"docs">, "sourceKind" | "sourceProjectId" | "sourceTaskId">]
        > = [
          ["project", { sourceKind: "project", sourceProjectId: f.projectId }],
          ["child", { sourceKind: "task", sourceTaskId: childId }],
          ["locked", { sourceKind: "task", sourceTaskId: lockedTaskId }],
        ];
        const teamId = await ctx.db.insert("teams", {
          name: "Team",
          createdBy: f.userId,
          createdAt: 0,
        });
        await ctx.db.insert("teamMembers", {
          teamId,
          userId: f.userId,
          role: "owner",
          joinedAt: 0,
        });
        const htmlStorageId = await ctx.storage.store(new Blob(["<p>hi</p>"]));
        for (const [name, source] of sources) {
          await ctx.db.insert("docs", {
            repoId: f.repoId,
            title: `${name} doc`,
            content: "",
            createdBy: f.userId,
            createdAt: 0,
            updatedAt: 0,
            ...source,
          });
          await ctx.db.insert("chatLogEntries", {
            repoId: f.repoId,
            kind: "decision",
            author: "agent",
            title: `${name} entry`,
            createdAt: 0,
            ...source,
          });
          await ctx.db.insert("artifacts", {
            name: `${name} artifact`,
            boundTeamId: teamId,
            declaredTools: [],
            htmlStorageId,
            uploadedBy: f.userId,
            createdAt: 0,
            ...source,
          });
        }
      });
      const source: { kind: "project"; projectId: Id<"projects"> } = {
        kind: "project",
        projectId: f.projectId,
      };
      const [docs, log, artifacts] = await Promise.all([
        f.asUser.query(api.docs.listForSource, { source }),
        f.asUser.query(api.chatLog.listForSource, { source }),
        f.asUser.query(api.artifacts.listForSource, { source }),
      ]);
      expect(docs.map((row) => row.title).sort()).toEqual(["child doc", "project doc"]);
      expect(log.map((row) => row.title).sort()).toEqual(["child entry", "project entry"]);
      expect(artifacts.map((row) => row.name).sort()).toEqual([
        "child artifact",
        "project artifact",
      ]);
    },
    TIMEOUT_MS,
  );
});

describe("deleting project work", () => {
  test(
    "the coordinator may delete only a task that has not started",
    async () => {
      const f = await fixture(3);
      const [notStarted, running, inReview] = f.tasks;
      await f.t.run(async (ctx) => {
        await ctx.db.patch(running, { status: "in_progress" });
        await ctx.db.patch(inReview, { status: "code_review" });
      });
      const check = (taskId: Id<"agentTasks">) =>
        f.t.query(internal.mcp.projectQueries.assertCoordinatorMayDeleteTask, {
          projectId: f.projectId,
          taskId,
        });
      await expect(check(notStarted)).resolves.toBeNull();
      await expect(check(running)).rejects.toThrow("has started");
      await expect(check(inReview)).rejects.toThrow("has started");

      // A todo task with a run pending has started too.
      await f.t.run((ctx) =>
        ctx.db.patch(running, {
          status: "todo",
          run: { state: "running", workflowId: "wf-1" },
        }),
      );
      await expect(check(running)).rejects.toThrow("has started");
    },
    TIMEOUT_MS,
  );

  test(
    "a project delete is refused while a task runs; otherwise its tasks stay as quick tasks",
    async () => {
      const f = await fixture(2);
      await schedule(f);
      await expect(
        f.asUser.mutation(api.projects.remove, { id: f.projectId }),
      ).rejects.toThrow("is running");
      expect((await f.t.run((ctx) => ctx.db.get(f.projectId)))?.deletedAt).toBeUndefined();

      await finishTask(f, f.tasks[0], "open");
      await finishTask(f, f.tasks[1], "merged");
      await f.asUser.mutation(api.projects.remove, { id: f.projectId });
      expect((await f.t.run((ctx) => ctx.db.get(f.projectId)))?.deletedAt).toBeDefined();
      for (const id of f.tasks) {
        const task = await taskDoc(f, id);
        expect(task.projectId).toBeUndefined();
        expect(task.taskNumber).toBeUndefined();
        expect(task.approvedAt).toBeUndefined();
        expect(task.deletedAt).toBeUndefined();
      }
      // Their sessions stay theirs.
      const owners = await f.t.run(async (ctx) =>
        (await ctx.db.query("sessions").collect()).map((s) => s.owner),
      );
      expect(owners).toEqual(
        expect.arrayContaining(f.tasks.map((taskId) => ({ kind: "task", taskId }))),
      );
    },
    TIMEOUT_MS,
  );
});

test(
  "a coordinator's sandbox is 2 vCPU and runs no dev server or background commands; a task's runs them",
  async () => {
    const f = await fixture(1);
    expect(
      sessionSandboxProfile({ kind: "project", projectId: f.projectId }),
    ).toEqual({ vcpus: COORDINATOR_VCPUS, runsServices: false });
    expect(COORDINATOR_VCPUS).toBe(2);
    expect(sessionSandboxProfile({ kind: "task", taskId: f.tasks[0] })).toEqual({
      vcpus: undefined,
      runsServices: true,
    });
  },
  TIMEOUT_MS,
);
