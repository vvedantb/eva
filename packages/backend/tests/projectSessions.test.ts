import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { DEFAULT_AI_MODEL } from "../convex/validators";
import { openTurn } from "../convex/_chat/turnStore";
import { ownedSessionBusy } from "../convex/_sessions/ownedSession";
import { taskWorkSessionBusy } from "../convex/_taskWorkflow/startRun";
import {
  buildProjectBranchName,
  buildTaskBranchName,
} from "../convex/_git/branchNames";

/**
 * A project owns one hidden session (its coordinator's), and each of its
 * child tasks owns its own session, branch and Main chat, exactly like a
 * quick task, so tasks of one project run in parallel without holding each
 * other or the project.
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
    "a project owns one hidden session, and each of its tasks owns its own",
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
      expect(taskChat.sessionId).not.toBe(first.sessionId);
      expect(
        await f.asUser.mutation(api.sessions.ensureOwned, {
          owner: { kind: "task", taskId: f.taskId },
        }),
      ).toEqual(taskChat);
      const [chat, taskSession, projectSession] = await f.t.run(
        async (ctx) => [
          await ctx.db.get(taskChat.chatId),
          await ctx.db.get(taskChat.sessionId),
          await ctx.db.get(first.sessionId),
        ],
      );
      // The task chats in its own session's Main chat, on its own branch.
      expect(chat).toMatchObject({ isMain: true });
      expect(chat?.taskId).toBeUndefined();
      expect(taskSession).toMatchObject({
        owner: { kind: "task", taskId: f.taskId },
        branchName: buildTaskBranchName(f.taskId),
        status: "closed",
      });
      expect(projectSession).toMatchObject({
        owner: { kind: "project", projectId: f.projectId },
        branchName: buildProjectBranchName(f.projectId),
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
    "two tasks of one project are busy apart: a reply in one holds neither the other nor the project",
    async () => {
      const f = await fixture();
      const other = await f.t.run(async (ctx) =>
        ctx.db.insert("agentTasks", {
          repoId: f.repoId,
          projectId: f.projectId,
          title: "Second project task",
          status: "todo",
          numId: 2,
          createdAt: 0,
          updatedAt: 0,
          createdBy: f.userId,
        }),
      );
      const { sessionId, chatId } = await f.asUser.mutation(
        api.sessions.ensureOwned,
        { owner: { kind: "task", taskId: f.taskId } },
      );
      await ensureProjectSession(f);
      await f.t.run(async (ctx) => {
        await openTurn(ctx, {
          entityId: chatId,
          sessionId,
          streamingEntityId: String(chatId),
          model: DEFAULT_AI_MODEL,
          repoId: f.repoId,
        });
      });
      const busy = await f.t.run(async (ctx) => [
        await taskWorkSessionBusy(ctx.db, { _id: f.taskId }),
        await taskWorkSessionBusy(ctx.db, { _id: other }),
        await ownedSessionBusy(ctx.db, {
          kind: "project",
          projectId: f.projectId,
        }),
      ]);
      expect(busy).toEqual([true, false, false]);
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
