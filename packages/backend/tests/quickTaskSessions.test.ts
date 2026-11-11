import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { DEFAULT_AI_MODEL } from "../convex/validators";
import { openTurn } from "../convex/_chat/turnStore";
import { migrateQuickTaskToSession } from "../convex/_migrations/quickTaskChatsToSessions";

/**
 * PR 1b: a quick task runs on one owned session. Guards the rules that keep
 * that session a single, hidden engine: one session per task, never listed
 * as a session, chat sends queue behind the task's run, and the migration
 * moves the task's sandbox and transcript onto it (and waits on busy tasks).
 */

const modules = import.meta.glob("../convex/**/*.ts");
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
  test(
    "a quick task owns exactly one session, hidden from the Sessions list",
    async () => {
      const f = await fixture();
      const first = await f.asUser.mutation(api.sessions.ensureOwned, {
        taskId: f.taskId,
      });
      const second = await f.asUser.mutation(api.sessions.ensureOwned, {
        taskId: f.taskId,
      });
      expect(second).toEqual(first);
      expect(
        await f.asUser.query(api.sessions.getOwned, { taskId: f.taskId }),
      ).toEqual(first);

      const owned = await f.t.run(async (ctx) => {
        await ctx.db.patch(first.sessionId, { status: "active" });
        return await ctx.db
          .query("sessions")
          .withIndex("by_owner_task", (q) => q.eq("owner.taskId", f.taskId))
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
    "a chat message sent while the task's run is open queues behind the run",
    async () => {
      const f = await fixture();
      const { sessionId, chatId } = await f.asUser.mutation(
        api.sessions.ensureOwned,
        { taskId: f.taskId },
      );
      await f.t.run(async (ctx) => {
        const runId = await ctx.db.insert("agentRuns", {
          taskId: f.taskId,
          status: "running",
          logs: [],
        });
        await openTurn(ctx, {
          entityId: runId,
          sessionId,
          streamingEntityId: `task-run-${runId}`,
          model: DEFAULT_AI_MODEL,
          repoId: f.repoId,
        });
      });

      const delivered = await f.asUser.mutation(
        api.sessionWorkflow.startExecute,
        { chatId, message: "follow-up", model: DEFAULT_AI_MODEL },
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

  test(
    "the migration moves a quick task's sandbox and transcript onto its session, and waits on a busy task",
    async () => {
      const f = await fixture();
      const busyTaskId = await f.t.run(async (ctx) => {
        await ctx.db.patch(f.taskId, {
          sandboxId: "sbx-task",
          reviewTaskSandboxStatus: "closed",
          devPort: 3000,
          lastChatModel: DEFAULT_AI_MODEL,
          lastTurnFinishedAt: 1_000,
        });
        await ctx.db.insert("messages", {
          parentId: f.taskId,
          role: "user",
          content: "old task chat",
          timestamp: 1,
        });
        const now = Date.now();
        return await ctx.db.insert("agentTasks", {
          repoId: f.repoId,
          title: "Busy task",
          status: "todo",
          numId: 2,
          createdAt: now,
          updatedAt: now,
          createdBy: f.userId,
          sandboxId: "sbx-busy",
          reviewTaskSandboxStatus: "starting",
        });
      });

      const migrate = (taskId: typeof f.taskId) =>
        f.t.run(async (ctx) => {
          const task = await ctx.db.get(taskId);
          if (!task) throw new Error("task missing");
          return await migrateQuickTaskToSession(ctx, task);
        });
      expect(await migrate(f.taskId)).toBe("migrated");
      expect(await migrate(busyTaskId)).toBe("skipped_busy");
      // Idempotent: a rerun finds everything already moved.
      expect(await migrate(f.taskId)).toBe("migrated");

      const state = await f.t.run(async (ctx) => {
        const sessions = await ctx.db
          .query("sessions")
          .withIndex("by_owner_task", (q) => q.eq("owner.taskId", f.taskId))
          .collect();
        const session = sessions[0];
        const chat = session
          ? await ctx.db
              .query("sessionChats")
              .withIndex("by_session", (q) => q.eq("sessionId", session._id))
              .first()
          : null;
        const messages = chat
          ? await ctx.db
              .query("messages")
              .withIndex("by_parent", (q) => q.eq("parentId", chat._id))
              .collect()
          : [];
        return {
          sessions,
          chat,
          messages,
          task: await ctx.db.get(f.taskId),
          busy: await ctx.db.get(busyTaskId),
        };
      });
      expect(state.sessions).toHaveLength(1);
      expect(state.sessions[0]).toMatchObject({
        sandboxId: "sbx-task",
        status: "closed",
        devPort: 3000,
      });
      expect(state.task?.sandboxId).toBeUndefined();
      expect(state.task?.reviewTaskSandboxStatus).toBeUndefined();
      expect(state.chat?.claudePersistenceSeed).toBe(f.taskId);
      expect(state.messages.map((row) => row.content)).toEqual([
        "old task chat",
      ]);
      expect(state.busy?.sandboxId).toBe("sbx-busy");
    },
    TIMEOUT_MS,
  );
});
