import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

/**
 * The composer picks send or queue from its own subscription, so a burst of
 * sends can all reach `startExecute` before it sees the first turn. Each one
 * used to start, so two turns ran at once. A send that lands behind a running
 * turn must queue instead, and its composer-stored user row must go (the
 * dequeue inserts its own).
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|send-burst";
const BURST_MESSAGE = "and also rename the button";

async function baseFixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    return { userId, repoId };
  });
  return { t, asUser: t.withIdentity({ subject: CLERK_ID }), ...ids };
}

function chatState(
  t: ReturnType<typeof convexTest>,
  parentId: Id<"sessionChats"> | Id<"agentTasks">,
) {
  return t.run(async (ctx) => {
    const queued = await ctx.db
      .query("queuedMessages")
      .withIndex("by_parent_and_order", (q) => q.eq("parentId", parentId))
      .collect();
    const userRows = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", parentId))
      .filter((q) => q.eq(q.field("role"), "user"))
      .collect();
    return {
      queued: queued.map((row) => row.content),
      userRows: userRows.map((row) => row.content),
    };
  });
}

describe("a send that lands behind a running turn", () => {
  test(
    "queues on a session chat instead of starting a second turn",
    async () => {
      const f = await baseFixture();
      const chatId = await f.t.run(async (ctx) => {
        const sessionId = await ctx.db.insert("sessions", {
          repoId: f.repoId,
          userId: f.userId,
          title: "Send burst",
          status: "active",
          numId: 1,
        });
        const id = await ctx.db.insert("sessionChats", {
          sessionId,
          repoId: f.repoId,
          userId: f.userId,
          title: "Main",
          number: 1,
          isMain: true,
          activeWorkflowId: "wf-first-send",
        });
        await ctx.db.insert("messages", {
          parentId: id,
          role: "user",
          content: BURST_MESSAGE,
          timestamp: Date.now(),
        });
        return id;
      });

      const outcome = await f.asUser.mutation(
        api.sessionWorkflow.startExecute,
        { chatId, message: BURST_MESSAGE, model: "claude:sonnet" },
      );

      expect(outcome).toBe("queued");
      expect(await chatState(f.t, chatId)).toEqual({
        queued: [BURST_MESSAGE],
        userRows: [],
      });
      const chat = await f.t.run((ctx) => ctx.db.get(chatId));
      expect(chat?.activeWorkflowId).toBe("wf-first-send");
    },
    TIMEOUT_MS,
  );

  test(
    "queues on a task chat and keeps the row's attachments",
    async () => {
      const f = await baseFixture();
      const { taskId, storageId } = await f.t.run(async (ctx) => {
        const now = Date.now();
        const id = await ctx.db.insert("agentTasks", {
          title: "Send burst",
          status: "in_progress" as const,
          repoId: f.repoId,
          createdAt: now,
          updatedAt: now,
          createdBy: f.userId,
          activeChatWorkflowId: "wf-first-send",
        });
        const blob = await ctx.storage.store(new Blob(["png"]));
        await ctx.db.insert("messages", {
          parentId: id,
          role: "user",
          content: BURST_MESSAGE,
          timestamp: now,
          attachmentStorageIds: [blob],
        });
        return { taskId: id, storageId: blob };
      });

      await f.asUser.mutation(api.agentTaskChatWorkflow.startExecute, {
        taskId,
        message: BURST_MESSAGE,
        model: "claude:sonnet",
      });

      expect(await chatState(f.t, taskId)).toEqual({
        queued: [BURST_MESSAGE],
        userRows: [],
      });
      const queued = await f.t.run((ctx) =>
        ctx.db
          .query("queuedMessages")
          .withIndex("by_parent_and_order", (q) => q.eq("parentId", taskId))
          .first(),
      );
      expect(queued?.attachmentStorageIds).toEqual([storageId]);
      const task = await f.t.run((ctx) => ctx.db.get(taskId));
      expect(task?.activeChatWorkflowId).toBe("wf-first-send");
    },
    TIMEOUT_MS,
  );
});
