import { convexTest } from "convex-test";
import workflow from "@convex-dev/workflow/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * `authMutation` / `authQuery` only authenticate. Each public function below
 * took an id and acted on it without checking the caller can access its
 * repo, so any signed-in user could edit, clear or run AI work on another
 * team's doc, project, session or task. A stranger must now be refused.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const OWNER = "clerk|access-owner";
const STRANGER = "clerk|access-stranger";

// Starts schedule workflow steps; keep them from running after the test.
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
    const ownerUserId = await ctx.db.insert("users", { clerkId: OWNER });
    await ctx.db.insert("users", { clerkId: STRANGER });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: ownerUserId,
    });
    const otherRepoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "other",
      installationId: 1,
      connectedBy: ownerUserId,
    });
    const now = Date.now();
    const docId = await ctx.db.insert("docs", {
      repoId,
      title: "Spec",
      content: "secret",
      createdAt: now,
      updatedAt: now,
    });
    const projectId = await ctx.db.insert("projects", {
      repoId,
      userId: ownerUserId,
      title: "Billing",
      rawInput: "billing",
      phase: "finalized",
      numId: 1,
    });
    const sessionId = await ctx.db.insert("sessions", {
      repoId,
      userId: ownerUserId,
      title: "Fix the login bug",
      status: "active",
      ptySessionId: "pty_owner",
    });
    const taskId = await ctx.db.insert("agentTasks", {
      title: "Owner task",
      status: "todo",
      numId: 1,
      repoId,
      createdAt: now,
      updatedAt: now,
      createdBy: ownerUserId,
    });
    return { repoId, otherRepoId, docId, projectId, sessionId, taskId };
  });
  return {
    t,
    owner: t.withIdentity({ subject: OWNER }),
    stranger: t.withIdentity({ subject: STRANGER }),
    ...ids,
  };
}

describe("public functions refuse callers without repo access", () => {
  test(
    "docs",
    async () => {
      const f = await fixture();
      await expect(
        f.stranger.mutation(api.docs.update, { id: f.docId, title: "pwned" }),
      ).rejects.toThrow("Not authorized");
      await expect(
        f.stranger.mutation(api.docs.clearInterview, { id: f.docId }),
      ).rejects.toThrow("Not authorized");
      await expect(
        f.stranger.mutation(api.docs.addInterviewMessage, {
          id: f.docId,
          role: "user",
          content: "hi",
        }),
      ).rejects.toThrow("Not authorized");
      await expect(
        f.stranger.mutation(api.testGenWorkflow.startTestGen, {
          docId: f.docId,
        }),
      ).rejects.toThrow("Not authorized");
      await expect(
        f.stranger.mutation(api.testGenWorkflow.cancelTestGen, {
          docId: f.docId,
        }),
      ).rejects.toThrow("Not authorized");
      await expect(
        f.stranger.mutation(api.docInterviewWorkflow.startInterview, {
          docId: f.docId,
          docTitle: "Spec",
          previousAnswers: [],
        }),
      ).rejects.toThrow("Not authorized");
      await expect(
        f.stranger.mutation(api.docInterviewWorkflow.startGenerate, {
          docId: f.docId,
          docTitle: "Spec",
          previousAnswers: [],
        }),
      ).rejects.toThrow("Not authorized");
      const title = await f.t.run(
        async (ctx) => (await ctx.db.get(f.docId))?.title,
      );
      expect(title).toBe("Spec");
    },
    TIMEOUT_MS,
  );

  test(
    "projects",
    async () => {
      const f = await fixture();
      await expect(
        f.stranger.mutation(api.projects.startDevelopment, {
          projectId: f.projectId,
        }),
      ).rejects.toThrow("Not authorized");
      await expect(
        f.stranger.mutation(api.projectInterviewWorkflow.startInterview, {
          projectId: f.projectId,
          featureDescription: "x",
          previousAnswers: [],
        }),
      ).rejects.toThrow("Not authorized");
      await expect(
        f.stranger.mutation(api.projectInterviewWorkflow.startSpec, {
          projectId: f.projectId,
          featureDescription: "x",
        }),
      ).rejects.toThrow("Not authorized");
    },
    TIMEOUT_MS,
  );

  test(
    "a project cannot adopt another repo's task",
    async () => {
      const f = await fixture();
      await expect(
        f.owner.mutation(api.projects.createFromTasks, {
          repoId: f.otherRepoId,
          title: "Grab",
          taskIds: [f.taskId],
        }),
      ).rejects.toThrow("Tasks must belong to this repository");
    },
    TIMEOUT_MS,
  );

  test(
    "sessions and tasks",
    async () => {
      const f = await fixture();
      await expect(
        f.stranger.mutation(api.sessions.updatePtySession, {
          id: f.sessionId,
          ptySessionId: undefined,
        }),
      ).rejects.toThrow("Not authorized");
      expect(
        await f.stranger.query(api.agentTasks.getStatusesByIds, {
          ids: [f.taskId],
        }),
      ).toEqual([]);
      expect(
        await f.owner.query(api.agentTasks.getStatusesByIds, {
          ids: [f.taskId],
        }),
      ).toEqual([{ id: f.taskId, status: "todo" }]);
    },
    TIMEOUT_MS,
  );
});

describe("the doc workflow slot", () => {
  test(
    "a second start waits for the running one, and cancel only stops test gen",
    async () => {
      const f = await fixture();
      await f.owner.mutation(api.docInterviewWorkflow.startInterview, {
        docId: f.docId,
        docTitle: "Spec",
        previousAnswers: [],
      });
      const slot = () =>
        f.t.run(async (ctx) => (await ctx.db.get(f.docId))?.activeWorkflowId);
      const interviewId = await slot();
      expect(interviewId).toBeDefined();

      await expect(
        f.owner.mutation(api.testGenWorkflow.startTestGen, { docId: f.docId }),
      ).rejects.toThrow("Another document task is still running");
      // A re-fired interview start is a quiet no-op, not a second workflow.
      await f.owner.mutation(api.docInterviewWorkflow.startGenerate, {
        docId: f.docId,
        docTitle: "Spec",
        previousAnswers: [],
      });
      await f.owner.mutation(api.testGenWorkflow.cancelTestGen, {
        docId: f.docId,
      });
      expect(await slot()).toBe(interviewId);
    },
    TIMEOUT_MS,
  );
});
