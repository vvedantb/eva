import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { DEFAULT_AI_MODEL } from "../convex/validators";
import { openTurn } from "../convex/_chat/turnStore";
import { rotateProjectBranch } from "../convex/_sessions/ownedSession";
import { buildProjectBranchName } from "../convex/_git/branchNames";

/**
 * PR 2: a project and its tasks run on the project's one owned session.
 * Guards the rules that keep it a single engine: one session per project,
 * project tasks share it (each with its own chat), chat queues behind a
 * running build and a build waits for the chat, and a merged PR's branch
 * rotation moves the session to the new branch and drops its old VM.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|project-sessions";

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const projectId = await ctx.db.insert("projects", {
      repoId,
      userId,
      title: "Project",
      rawInput: "Project",
      phase: "business_review",
      numId: 1,
    });
    const now = Date.now();
    const taskId = await ctx.db.insert("agentTasks", {
      repoId,
      projectId,
      title: "Project task",
      status: "todo",
      numId: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    });
    return { userId, repoId, projectId, taskId };
  });
  return { t, asUser: t.withIdentity({ subject: CLERK_ID }), ...ids };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

const ensureProjectSession = (f: Fixture) =>
  f.asUser.mutation(api.sessions.ensureOwned, {
    owner: { kind: "project", projectId: f.projectId },
  });

describe("projects on sessions", () => {
  // Scheduled follow-ups (VM delete, queue drain) stay parked: these tests
  // check the writes, not the actions.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test(
    "a project owns one hidden session, and its tasks work on it in their own chat",
    async () => {
      const f = await fixture();
      const first = await ensureProjectSession(f);
      expect(await ensureProjectSession(f)).toEqual(first);
      expect(
        await f.asUser.query(api.sessions.list, { repoId: f.repoId }),
      ).toEqual([]);

      const taskChat = await f.asUser.mutation(api.sessions.ensureOwned, {
        owner: { kind: "task", taskId: f.taskId },
      });
      expect(taskChat.sessionId).toBe(first.sessionId);
      expect(taskChat.chatId).not.toBe(first.chatId);
      expect(
        await f.asUser.mutation(api.sessions.ensureOwned, {
          owner: { kind: "task", taskId: f.taskId },
        }),
      ).toEqual(taskChat);
      const chat = await f.t.run((ctx) => ctx.db.get(taskChat.chatId));
      expect(chat).toMatchObject({ isMain: false, taskId: f.taskId });
      const sessions = await f.t.run((ctx) =>
        ctx.db.query("sessions").collect(),
      );
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        owner: { kind: "project", projectId: f.projectId },
        branchName: buildProjectBranchName(f.projectId),
        status: "closed",
      });
      // Owned sessions refuse session-only actions; a user cannot open more chats.
      await expect(
        f.asUser.mutation(api.sessionChats.create, {
          sessionId: first.sessionId,
        }),
      ).rejects.toThrow("A project's session cannot open another chat.");
    },
    TIMEOUT_MS,
  );

  test(
    "a project chat message queues behind a running build, and a build waits for the chat",
    async () => {
      const f = await fixture();
      const { sessionId, chatId } = await ensureProjectSession(f);
      await f.t.run(async (ctx) => {
        await ctx.db.patch(f.projectId, {
          build: { state: "running", workflowId: "wf-build" },
        });
      });
      expect(
        await f.asUser.mutation(api.sessionWorkflow.startExecute, {
          chatId,
          message: "while building",
          model: DEFAULT_AI_MODEL,
        }),
      ).toBe("queued");

      // No build yet, but the chat is replying: the build is refused.
      await f.t.run(async (ctx) => {
        await ctx.db.patch(f.projectId, { build: undefined });
        await openTurn(ctx, {
          entityId: chatId,
          sessionId,
          streamingEntityId: String(chatId),
          model: DEFAULT_AI_MODEL,
          repoId: f.repoId,
        });
      });
      await expect(
        f.asUser.mutation(api.buildWorkflow.startBuild, {
          projectId: f.projectId,
        }),
      ).rejects.toThrow("still replying in this project's chat");
    },
    TIMEOUT_MS,
  );

  test(
    "a merged PR rotates the project branch and drops the session's sandbox in one write",
    async () => {
      const f = await fixture();
      const { sessionId } = await ensureProjectSession(f);
      await f.t.run(async (ctx) => {
        await ctx.db.patch(sessionId, {
          sandboxId: "sbx-project",
          status: "active",
          sandboxStartAttempt: 3,
        });
        const project = await ctx.db.get(f.projectId);
        if (!project) throw new Error("project missing");
        await rotateProjectBranch(ctx, project);
      });
      const [project, session] = await f.t.run(async (ctx) => [
        await ctx.db.get(f.projectId),
        await ctx.db.get(sessionId),
      ]);
      const nextBranch = buildProjectBranchName(f.projectId, 2);
      expect(project).toMatchObject({ branchVersion: 2, branchName: nextBranch });
      expect(session).toMatchObject({ branchName: nextBranch, status: "closed" });
      expect(session?.sandboxId).toBeUndefined();
      // A start in flight on the old branch is fenced off.
      expect(session?.sandboxStartAttempt).toBe(4);
    },
    TIMEOUT_MS,
  );

  test(
    "a branch rotation waits while the project chat is replying",
    async () => {
      const f = await fixture();
      const { sessionId, chatId } = await ensureProjectSession(f);
      await f.t.run(async (ctx) => {
        await ctx.db.patch(sessionId, { sandboxId: "sbx-busy", status: "active" });
        await openTurn(ctx, {
          entityId: chatId,
          sessionId,
          streamingEntityId: String(chatId),
          model: DEFAULT_AI_MODEL,
          repoId: f.repoId,
        });
        const project = await ctx.db.get(f.projectId);
        if (!project) throw new Error("project missing");
        await rotateProjectBranch(ctx, project);
      });
      const [project, session] = await f.t.run(async (ctx) => [
        await ctx.db.get(f.projectId),
        await ctx.db.get(sessionId),
      ]);
      // The project moves on; the busy session keeps its VM and branch.
      expect(project?.branchVersion).toBe(2);
      expect(session).toMatchObject({
        sandboxId: "sbx-busy",
        branchName: buildProjectBranchName(f.projectId),
      });
    },
    TIMEOUT_MS,
  );

  test(
    "a completed project retires its session and a reopened one revives it",
    async () => {
      const f = await fixture();
      const { sessionId } = await ensureProjectSession(f);
      await f.asUser.mutation(api.projects.update, {
        id: f.projectId,
        phase: "completed",
      });
      const retired = await f.t.run((ctx) => ctx.db.get(sessionId));
      expect(retired?.archive).toBeDefined();
      await f.asUser.mutation(api.projects.update, {
        id: f.projectId,
        phase: "business_review",
      });
      const revived = await f.t.run((ctx) => ctx.db.get(sessionId));
      expect(revived?.archive).toBeUndefined();
    },
    TIMEOUT_MS,
  );
});
