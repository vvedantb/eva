import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { DEFAULT_AI_MODEL } from "../convex/validators";
import { openSessionChatTurn } from "../convex/_chat/turnStore";
import { modules } from "./_helpers/convexModules";

/**
 * PR 1b: a quick task runs on one owned session. Guards the rules that keep
 * that session a single, hidden engine: one session per task, never listed
 * as a session, chat sends queue behind the task's run, and the migration
 * moves the task's sandbox and transcript onto it (and waits on busy tasks).
 */

const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|quick-task-sessions";

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
    const now = Date.now();
    const taskId = await ctx.db.insert("agentTasks", {
      repoId,
      title: "Quick task",
      status: "todo",
      numId: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    });
    return { userId, repoId, taskId };
  });
  return { t, asUser: t.withIdentity({ subject: CLERK_ID }), ...ids };
}

describe("quick tasks on sessions", () => {
  // Scheduled stops and drains stay queued instead of running after a test.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  test(
    "a quick task owns exactly one session, hidden from the Sessions list",
    async () => {
      const f = await fixture();
      const first = await f.asUser.mutation(api.sessions.ensureOwned, {
        owner: { kind: "task", taskId: f.taskId },
      });
      const second = await f.asUser.mutation(api.sessions.ensureOwned, {
        owner: { kind: "task", taskId: f.taskId },
      });
      expect(second).toEqual(first);
      expect(
        (await f.asUser.query(api.sessions.getOwnedWithSeed, { owner: { kind: "task", taskId: f.taskId } }))?.session,
      ).toEqual(first);

      const owned = await f.t.run(async (ctx) => {
        await ctx.db.patch(first.sessionId, { status: "active" });
        return await ctx.db
          .query("sessions")
          .withIndex("by_owner_task", (q) =>
            q.eq("owner.taskId", f.taskId).eq("deletedAt", undefined),
          )
          .collect();
      });
      expect(owned).toHaveLength(1);
      expect(owned[0]?.numId).toBeDefined();

      const listed = await f.asUser.query(api.sessions.list, {
        repoId: f.repoId,
      });
      expect(listed.map((row) => row._id)).not.toContain(first.sessionId);
      expect(
        await f.asUser.query(api.sessions.countActive, { repoId: f.repoId }),
      ).toBe(0);
      await expect(
        f.asUser.mutation(api._sessionChats.mutations.create, {
          sessionId: first.sessionId,
        }),
      ).rejects.toThrow("A task's session cannot open another chat.");
    },
    TIMEOUT_MS,
  );

  test(
    "moving a quick task to another repo retires its session; the next use creates a fresh one there",
    async () => {
      const f = await fixture();
      const first = await f.asUser.mutation(api.sessions.ensureOwned, {
        owner: { kind: "task", taskId: f.taskId },
      });
      const otherRepoId = await f.t.run((ctx) =>
        ctx.db.insert("githubRepos", {
          owner: "vvedantb",
          name: "other",
          installationId: 1,
          connectedBy: f.userId,
        }),
      );
      await f.asUser.mutation(api.agentTasks.update, {
        id: f.taskId,
        repoId: otherRepoId,
      });
      const old = await f.t.run((ctx) => ctx.db.get(first.sessionId));
      expect(old?.deletedAt).toBeDefined();
      expect(old?.archive).toBeDefined();
      expect(
        (await f.asUser.query(api.sessions.getOwnedWithSeed, { owner: { kind: "task", taskId: f.taskId } }))?.session,
      ).toBeNull();
      const next = await f.asUser.mutation(api.sessions.ensureOwned, {
        owner: { kind: "task", taskId: f.taskId },
      });
      expect(next.sessionId).not.toBe(first.sessionId);
      const fresh = await f.t.run((ctx) => ctx.db.get(next.sessionId));
      expect(fresh?.repoId).toBe(otherRepoId);
    },
    TIMEOUT_MS,
  );

  test(
    "a chat message sent while the task's run is open queues behind the run",
    async () => {
      const f = await fixture();
      const { sessionId, chatId } = await f.asUser.mutation(
        api.sessions.ensureOwned,
        { owner: { kind: "task", taskId: f.taskId } },
      );
      // The task's run is a task-mode turn in its chat.
      await f.t.run((ctx) =>
        openSessionChatTurn(ctx, {
          chatId,
          sessionId,
          streamingEntityId: String(chatId),
          model: DEFAULT_AI_MODEL,
          repoId: f.repoId,
          taskRun: { mode: "implementation" },
        }),
      );

      const delivered = await f.t.mutation(
        internal._sessions.execution.sendFromMcp,
        {
          clerkUserId: CLERK_ID,
          chatId,
          message: "follow-up",
          model: DEFAULT_AI_MODEL,
          sentViaOrchestrator: false,
        },
      );
      expect(delivered).toBe("queued");
      const queued = await f.t.run((ctx) =>
        ctx.db
          .query("queuedMessages")
          .withIndex("by_parent_and_order", (q) => q.eq("parentId", chatId))
          .collect(),
      );
      expect(queued.map((row) => row.content)).toEqual(["follow-up"]);
    },
    TIMEOUT_MS,
  );
});
