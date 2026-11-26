import { convexTest } from "convex-test";
import { describe, expect, test } from "bun:test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import {
  groupNeedsYou,
  needsYouGroupForProjectTask,
  needsYouGroupForQuickTask,
  needsYouGroupForSession,
  needsYouSourceLabel,
} from "@eva/shared/needsYou";
import { modules } from "./_helpers/convexModules";

/**
 * The Inbox's Needs you view: the shared rules that place a row in a group,
 * and `needsYou.list` over real rows (a project's Triage task, a quick task's
 * PR to review, a failed quick task, and someone else's quick task that must
 * not show).
 */

const CLERK_ID = "clerk|needs-you";
const OTHER_CLERK_ID = "clerk|needs-you-other";

describe("Needs you rules", () => {
  test("a project task lands in its group; the rest stay on the project", () => {
    expect(needsYouGroupForProjectTask("question")).toBe("question");
    expect(needsYouGroupForProjectTask("review")).toBe("review");
    expect(needsYouGroupForProjectTask("approve")).toBe("triage");
    expect(needsYouGroupForProjectTask("failed")).toBe("failed");
    expect(needsYouGroupForProjectTask("stopped")).toBeUndefined();
    expect(needsYouGroupForProjectTask(undefined)).toBeUndefined();
  });

  test("a quick task waits on its open PR or its failed run", () => {
    const base = { lastRunFailed: false };
    expect(
      needsYouGroupForQuickTask({ ...base, status: "code_review", prState: "open" }),
    ).toBe("review");
    // A draft PR is not ready for review.
    expect(
      needsYouGroupForQuickTask({ ...base, status: "code_review", prState: "draft" }),
    ).toBeUndefined();
    expect(
      needsYouGroupForQuickTask({ status: "todo", lastRunFailed: true }),
    ).toBe("failed");
    expect(needsYouGroupForQuickTask({ ...base, status: "todo" })).toBeUndefined();
    expect(needsYouGroupForSession({ prState: "open" })).toBe("review");
    expect(needsYouGroupForSession({ prState: "merged" })).toBeUndefined();
  });

  test("groups keep their order, newest first, and drop empty groups", () => {
    const groups = groupNeedsYou([
      { group: "failed" as const, at: 1 },
      { group: "question" as const, at: 1 },
      { group: "question" as const, at: 5 },
    ]);
    expect(groups.map((group) => group.label)).toEqual(["Questions", "Failed"]);
    expect(groups[0]?.rows.map((row) => row.at)).toEqual([5, 1]);
    expect(needsYouSourceLabel({ source: "project", projectTitle: "Checkout" })).toBe(
      "Project · Checkout",
    );
    expect(needsYouSourceLabel({ source: "quick_task" })).toBe("Quick task");
  });
});

describe("needsYou.list", () => {
  test("lists what waits for the caller, by group", async () => {
    const t = convexTest(schema, modules);
    const { repoId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
      const otherUserId = await ctx.db.insert("users", { clerkId: OTHER_CLERK_ID });
      const repoId = await ctx.db.insert("githubRepos", {
        owner: "vvedantb",
        name: "eva",
        installationId: 1,
        connectedBy: userId,
      });
      const projectId = await ctx.db.insert("projects", {
        repoId,
        userId,
        title: "Checkout",
        rawInput: "Checkout",
        numId: 1,
      });
      const task = {
        repoId,
        createdAt: 0,
        updatedAt: 0,
      };
      // A person's project task, not approved: Triage.
      await ctx.db.insert("agentTasks", {
        ...task,
        projectId,
        title: "Promo code box",
        taskNumber: 1,
        status: "todo",
        numId: 1,
        createdBy: otherUserId,
      });
      // The caller's quick task with an open PR: To review.
      await ctx.db.insert("agentTasks", {
        ...task,
        title: "Fix login test",
        status: "code_review",
        prState: "open",
        prUrl: "https://github.com/vvedantb/eva/pull/1466",
        numId: 2,
        createdBy: userId,
      });
      // The caller's quick task whose last run failed: Failed.
      const failedId = await ctx.db.insert("agentTasks", {
        ...task,
        title: "Seed script",
        status: "todo",
        numId: 3,
        createdBy: userId,
      });
      // Its run is a task-mode turn in its own session's chat.
      const failedSessionId = await ctx.db.insert("sessions", {
        owner: { kind: "task", taskId: failedId },
        repoId,
        userId,
        title: "Seed script",
        status: "closed",
      });
      await ctx.db.insert("turns", {
        entityId: failedSessionId,
        sessionId: failedSessionId,
        streamingEntityId: String(failedSessionId),
        state: "error",
        open: false,
        turnStartedAt: 1,
        finishedAt: 2,
        leaseExpiresAt: 2,
        leaseGeneration: 1,
        model: "claude:opus",
        repoId,
        taskRun: { mode: "implementation" },
      });
      // Someone else's quick task with an open PR: not the caller's to review.
      await ctx.db.insert("agentTasks", {
        ...task,
        title: "Someone else's PR",
        status: "code_review",
        prState: "open",
        prUrl: "https://github.com/vvedantb/eva/pull/1467",
        numId: 4,
        createdBy: otherUserId,
      });
      return { repoId };
    });

    const rows = await t
      .withIdentity({ subject: CLERK_ID })
      .query(api.needsYou.list, {});
    const byTitle = new Map(rows.map((row) => [row.title, row]));
    expect(byTitle.get("Promo code box")?.group).toBe("triage");
    expect(byTitle.get("Promo code box")?.projectTitle).toBe("Checkout");
    expect(byTitle.get("Fix login test")?.group).toBe("review");
    expect(byTitle.get("Fix login test")?.detail).toBe("PR #1466");
    expect(byTitle.get("Seed script")?.group).toBe("failed");
    expect(byTitle.has("Someone else's PR")).toBe(false);

    // A repo's inbox lists that repo only (here the one repo there is).
    const scoped = await t
      .withIdentity({ subject: CLERK_ID })
      .query(api.needsYou.list, { repoId });
    expect(scoped).toHaveLength(rows.length);
  });
});
