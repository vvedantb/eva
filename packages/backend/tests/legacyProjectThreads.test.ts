import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { modules } from "./_helpers/convexModules";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
});

const OLD_BRANCH = "eva/project-legacy";
const PR_URL = "https://github.com/vvedantb/eva/pull/1574";

async function fixture(prState: "draft" | "merged" | "closed") {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: "clerk|legacy" });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const projectId = await ctx.db.insert("projects", {
      repoId,
      userId,
      title: "User management pages",
      rawInput: "x",
      numId: 1,
      branchName: OLD_BRANCH,
      prUrl: PR_URL,
      prState,
      prCount: 1,
    });
    await ctx.db.insert("pullRequests", {
      repoId,
      prUrl: PR_URL,
      prNumber: 1574,
      headBranch: OLD_BRANCH,
      state: prState,
      primary: true,
      origin: "eva",
      owner: { kind: "project", projectId },
      createdAt: 0,
      updatedAt: 0,
    });
    const sessionId = await ctx.db.insert("sessions", {
      owner: { kind: "project", projectId },
      repoId,
      userId,
      title: "User management pages",
      status: "closed",
      branchName: OLD_BRANCH,
      numId: 9,
    });
    const task = (
      title: string,
      status: "code_review" | "business_review" | "draft",
      numId: number,
    ) =>
      ctx.db.insert("agentTasks", {
        repoId,
        projectId,
        title,
        status,
        taskNumber: numId,
        numId,
        createdAt: 0,
        updatedAt: 0,
        createdBy: userId,
      });
    const reviewA = await task("Users table", "code_review", 11);
    const reviewB = await task("Invite flow", "business_review", 12);
    const draft = await task("Roles idea", "draft", 13);
    return { projectId, sessionId, reviewA, reviewB, draft };
  });
  return { t, ...ids };
}

const runMigration = (t: ReturnType<typeof convexTest>, dryRun?: boolean) =>
  t.mutation(
    internal.migrations.convertLegacyProjectThreads,
    dryRun === undefined ? {} : { dryRun },
  );

const statusOf = (t: ReturnType<typeof convexTest>, id: Id<"agentTasks">) =>
  t.run(async (ctx) => (await ctx.db.get(id))?.status);

describe("convertLegacyProjectThreads", () => {
  test("a live PR becomes one thread that owns the branch and PR", async () => {
    const f = await fixture("draft");
    const [result] = await runMigration(f.t);
    expect(result?.tasksCancelled).toBe(2);
    expect(result?.coordinatorBranchMoved).toBe(true);
    const threadId = result?.threadTaskId;
    if (threadId === undefined) throw new Error("no thread");

    const state = await f.t.run(async (ctx) => {
      const thread = await ctx.db.get(threadId);
      const row = await ctx.db
        .query("pullRequests")
        .withIndex("by_pr_url", (q) => q.eq("prUrl", PR_URL))
        .unique();
      return {
        thread,
        row,
        project: await ctx.db.get(f.projectId),
        session: await ctx.db.get(f.sessionId),
      };
    });
    expect(state.thread?.title).toBe("Earlier work (PR #1574)");
    expect(state.thread?.status).toBe("code_review");
    expect(state.thread?.branchName).toBe(OLD_BRANCH);
    expect(state.thread?.approvedAt).toBeDefined();
    expect(state.thread?.prUrl).toBe(PR_URL);
    expect(state.thread?.description).toContain("#11 Users table");
    expect(state.row?.owner).toEqual({ kind: "task", taskId: threadId });
    expect(state.project?.prUrl).toBeUndefined();
    expect(state.project?.branchName).toBeUndefined();
    expect(state.session?.branchName).not.toBe(OLD_BRANCH);

    expect(await statusOf(f.t, f.reviewA)).toBe("cancelled");
    expect(await statusOf(f.t, f.reviewB)).toBe("cancelled");
    expect(await statusOf(f.t, f.draft)).toBe("draft");

    expect(await runMigration(f.t)).toEqual([]);
  });

  test("a merged PR marks the old review tasks done", async () => {
    const f = await fixture("merged");
    const [result] = await runMigration(f.t);
    expect(result?.tasksDone).toBe(2);
    expect(result?.threadTaskId).toBeUndefined();
    expect(await statusOf(f.t, f.reviewA)).toBe("done");
    expect(await statusOf(f.t, f.reviewB)).toBe("done");
    expect(await runMigration(f.t)).toEqual([]);
  });

  test("a closed PR cancels the old review tasks", async () => {
    const f = await fixture("closed");
    const [result] = await runMigration(f.t);
    expect(result?.tasksCancelled).toBe(2);
    expect(await statusOf(f.t, f.reviewA)).toBe("cancelled");
    expect(await statusOf(f.t, f.reviewB)).toBe("cancelled");
  });

  test("a dry run reports and writes nothing", async () => {
    const f = await fixture("draft");
    const [result] = await runMigration(f.t, true);
    expect(result?.tasksCancelled).toBe(2);
    expect(result?.threadTaskId).toBeUndefined();
    expect(await statusOf(f.t, f.reviewA)).toBe("code_review");
    const branch = await f.t.run(
      async (ctx) => (await ctx.db.get(f.projectId))?.branchName,
    );
    expect(branch).toBe(OLD_BRANCH);
  });
});
