import { convexTest } from "convex-test";
import workflow from "@convex-dev/workflow/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { combineRepoPrStates } from "@eva/shared";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { ensureWorkSession } from "../convex/_sessions/ownedSession";
import { recordPullRequest } from "../convex/_pullRequests/store";
import { modules } from "./_helpers/convexModules";

/**
 * A project task across several repos, through the real Convex functions:
 * the coordinator's task with a linked repo gets one `sessionRepos` row on
 * its session, a repo the person cannot open is refused before anything is
 * written, and the task's PR state combines every repo's PR (merged only once
 * all merged).
 */

const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|multi-repo-task";
const OTHER_CLERK_ID = "clerk|multi-repo-task-other";
const HOME_PR = "https://github.com/vvedantb/eva/pull/12";
const LINKED_PR = "https://github.com/vvedantb/api/pull/7";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
});

async function fixture() {
  const t = convexTest(schema, modules);
  workflow.register(t);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const otherUserId = await ctx.db.insert("users", {
      clerkId: OTHER_CLERK_ID,
    });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const apiRepoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "api",
      installationId: 1,
      connectedBy: userId,
    });
    // Only the other user can open it.
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
      numId: 1,
    });
    return { userId, repoId, apiRepoId, lockedRepoId, projectId };
  });
  return { t, asUser: t.withIdentity({ subject: CLERK_ID }), ...ids };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

/** One coordinator task in the home repo, linked to `api`; its session made. */
async function multiRepoTask(f: Fixture) {
  const { taskIds } = await f.t.mutation(
    internal._projects.batches.createTasksFromCoordinator,
    {
      projectId: f.projectId,
      userId: f.userId,
      tasks: [{ title: "API and client", linkedRepoIds: [f.apiRepoId] }],
    },
  );
  const taskId = taskIds[0];
  const sessionId = await f.t.run(async (ctx) => {
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("task missing");
    const { session } = await ensureWorkSession(ctx, { kind: "task", task });
    return session._id;
  });
  return { taskId, sessionId };
}

const taskDoc = (f: Fixture, id: Id<"agentTasks">) =>
  f.t.run(async (ctx) => {
    const task = await ctx.db.get(id);
    if (!task) throw new Error("task missing");
    return task;
  });

const closePr = (f: Fixture, prUrl: string, merged: boolean) =>
  f.t.mutation(internal.githubWebhook.handlePullRequestEvent, {
    prUrl,
    action: "closed",
    merged,
  });

describe("combineRepoPrStates", () => {
  test("open while any repo's PR is open; merged only once all merged", () => {
    expect(combineRepoPrStates([])).toBeUndefined();
    expect(combineRepoPrStates(["draft"])).toBe("draft");
    expect(combineRepoPrStates(["merged", "open"])).toBe("open");
    expect(combineRepoPrStates(["merged", "draft"])).toBe("draft");
    expect(combineRepoPrStates(["merged", "merged"])).toBe("merged");
    expect(combineRepoPrStates(["merged", "closed"])).toBe("closed");
  });
});

describe("a project task across several repos", () => {
  test(
    "the coordinator's linked repo becomes one sessionRepos row on the task's session",
    async () => {
      const f = await fixture();
      const { taskId, sessionId } = await multiRepoTask(f);
      expect((await taskDoc(f, taskId)).linkedRepoIds).toEqual([f.apiRepoId]);
      const { rows, session } = await f.t.run(async (ctx) => ({
        rows: await ctx.db
          .query("sessionRepos")
          .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
          .collect(),
        session: await ctx.db.get(sessionId),
      }));
      expect(rows.map((row) => [row.repoId, row.name, row.path])).toEqual([
        [f.apiRepoId, "api", "/tmp/workspace/api"],
      ]);
      // Same branch as the task's own checkout.
      expect(rows[0].branchName).toBe(session?.branchName ?? "");
      expect(session?.linkedRepoCount).toBe(1);
    },
    TIMEOUT_MS,
  );

  test(
    "a linked repo the person cannot open, or the home repo, is refused before anything is written",
    async () => {
      const f = await fixture();
      await expect(
        f.t.mutation(internal._projects.batches.createTasksFromCoordinator, {
          projectId: f.projectId,
          userId: f.userId,
          tasks: [
            { title: "Fine" },
            { title: "Locked", linkedRepoIds: [f.lockedRepoId] },
          ],
        }),
      ).rejects.toThrow("has no access to its repository or a linked one");
      await expect(
        f.t.mutation(internal._projects.batches.createTasksFromCoordinator, {
          projectId: f.projectId,
          userId: f.userId,
          tasks: [{ title: "Home twice", linkedRepoIds: [f.repoId] }],
        }),
      ).rejects.toThrow("cannot also be a linked repository");
      const tasks = await f.t.run((ctx) => ctx.db.query("agentTasks").collect());
      expect(tasks).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    "the task reads open until both PRs merge, then done",
    async () => {
      const f = await fixture();
      const { taskId, sessionId } = await multiRepoTask(f);
      await f.t.run(async (ctx) => {
        await ctx.db.patch(taskId, { status: "code_review" });
        const linkRow = await ctx.db
          .query("sessionRepos")
          .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
          .unique();
        if (!linkRow) throw new Error("sessionRepos row missing");
        await recordPullRequest(ctx, {
          owner: { kind: "task", taskId },
          repoId: f.repoId,
          prUrl: HOME_PR,
          state: "open",
          primary: true,
          origin: "eva",
        });
        await recordPullRequest(ctx, {
          owner: { kind: "session", sessionId, sessionRepoId: linkRow._id },
          repoId: f.apiRepoId,
          prUrl: LINKED_PR,
          state: "open",
          primary: false,
          origin: "eva",
        });
      });
      let task = await taskDoc(f, taskId);
      expect([task.prState, task.prCount]).toEqual(["open", 2]);

      // The Review tab lists both, one per repo.
      const listed = await f.asUser.query(api.pullRequests.listForOwner, {
        owner: { kind: "task", taskId },
      });
      expect(listed.map((pr) => pr.repoName)).toEqual(["eva", "api"]);

      await closePr(f, HOME_PR, true);
      task = await taskDoc(f, taskId);
      expect([task.prState, task.status]).toEqual(["open", "code_review"]);

      await closePr(f, LINKED_PR, true);
      task = await taskDoc(f, taskId);
      expect([task.prState, task.status]).toEqual(["merged", "done"]);
    },
    TIMEOUT_MS,
  );
});
