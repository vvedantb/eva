import { convexTest } from "convex-test";
import workflow from "@convex-dev/workflow/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import type { Id } from "../convex/_generated/dataModel";
import { modules } from "./_helpers/convexModules";

/**
 * A project task's run is a turn in its task's Main chat
 * (`_taskWorkflow/runChatTurn.ts`; a quick task's run is a task-mode chat
 * turn instead, `quickTaskRun.test.ts`):
 * starting it writes the prompt and an empty reply, the chat reports it as
 * its open turn, and every terminal path settles the reply once. Fake timers
 * keep the run's workflow and sandbox steps queued.
 */

/** Loading the task-workflow module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|run-chat-turn";

async function fixture() {
  const t = convexTest(schema, modules);
  workflow.register(t);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
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
      title: "Flags",
      rawInput: "Flags",
      numId: 1,
    });
    const taskId = await ctx.db.insert("agentTasks", {
      repoId,
      projectId,
      taskNumber: 1,
      title: "Clean up the flag",
      description: "Remove the never events flag.",
      status: "todo",
      numId: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      model: "claude:opus",
    });
    return { userId, repoId, taskId };
  });
  const asUser = t.withIdentity({ subject: CLERK_ID });

  /** Starts a run and returns it with its task's Main chat. */
  async function startRun() {
    await asUser.mutation(api.agentTasks.startExecution, { id: ids.taskId });
    return await t.run(async (ctx) => {
      const run = await ctx.db
        .query("agentRuns")
        .withIndex("by_task", (q) => q.eq("taskId", ids.taskId))
        .order("desc")
        .first();
      const reply = run?.replyMessageId
        ? await ctx.db.get(run.replyMessageId)
        : null;
      const chatId = reply
        ? ctx.db.normalizeId("sessionChats", reply.parentId)
        : null;
      if (!run || !chatId) throw new Error("The run has no chat turn");
      return { runId: run._id, chatId };
    });
  }

  const rows = (chatId: Id<"sessionChats">) =>
    t.run((ctx) =>
      ctx.db
        .query("messages")
        .withIndex("by_parent", (q) => q.eq("parentId", chatId))
        .collect(),
    );

  return { t, ids, asUser, startRun, rows };
}

describe("a project task's run is a turn in its task's chat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test(
    "starting a run writes its prompt and an open reply the chat reports",
    async () => {
      const { t, asUser, startRun, rows } = await fixture();
      const { runId, chatId } = await startRun();

      const messages = await rows(chatId);
      expect(
        messages.map((m) => ({
          role: m.role,
          content: m.content,
          runId: m.runId,
          finished: m.finishedAt !== undefined,
        })),
      ).toEqual([
        {
          role: "user",
          content: "Clean up the flag\n\nRemove the never events flag.",
          runId,
          finished: false,
        },
        { role: "assistant", content: "", runId, finished: false },
      ]);

      const status = await asUser.query(api.turns.getChatStatus, {
        entityId: chatId,
      });
      expect(status?.source).toBe("durable");
      expect(
        status?.source === "durable" ? status.placeholderMessageId : undefined,
      ).toBe(messages[1]?._id);
      const turn = await t.run((ctx) =>
        ctx.db
          .query("turns")
          .withIndex("by_entity_open", (q) =>
            q.eq("entityId", runId).eq("lane", undefined).eq("open", true),
          )
          .first(),
      );
      expect(turn?.streamingEntityId).toBe(String(chatId));
    },
    TIMEOUT_MS,
  );

  test(
    "a failed run replies with the agent's last text, then the error, and marks the chat unread",
    async () => {
      const { t, ids, startRun, rows } = await fixture();
      const { runId, chatId } = await startRun();

      await t.mutation(internal.taskWorkflow.completeRun, {
        runId,
        taskId: ids.taskId,
        success: false,
        error: "Agent finished without creating a new git commit.",
        prError: null,
        prUrl: null,
        activityLog: '[{"type":"bash","label":"Ran command"}]',
        claudeResult: "Which flag do you mean?",
      });

      const reply = (await rows(chatId)).find((m) => m.role === "assistant");
      expect(reply?.content).toBe(
        "Which flag do you mean?\n\nError: Agent finished without creating a new git commit.",
      );
      expect(reply?.activityLog).toBe('[{"type":"bash","label":"Ran command"}]');
      expect(reply?.finishedAt).toBeDefined();

      await t.mutation(internal.taskWorkflow.closeRunTurn, {
        runId,
        success: false,
      });
      const chat = await t.run((ctx) => ctx.db.get(chatId));
      expect(chat?.lastTurnFinishedAt).toBeDefined();
    },
    TIMEOUT_MS,
  );

  test(
    "Stop marks the run's reply stopped, and the next run asks to run again",
    async () => {
      const { asUser, startRun, rows } = await fixture();
      const first = await startRun();

      await asUser.mutation(api.sessions.stopChatTurn, {
        target: { chatId: first.chatId },
      });
      const stopped = (await rows(first.chatId)).find(
        (m) => m.role === "assistant",
      );
      expect(stopped?.stopped).toBe(true);
      expect(stopped?.finishedAt).toBeDefined();
      expect(
        await asUser.query(api.turns.getChatStatus, { entityId: first.chatId }),
      ).toBeNull();

      const second = await startRun();
      expect(second.chatId).toBe(first.chatId);
      const prompts = (await rows(second.chatId))
        .filter((m) => m.role === "user")
        .map((m) => m.content);
      expect(prompts).toEqual([
        "Clean up the flag\n\nRemove the never events flag.",
        "Run again",
      ]);
    },
    TIMEOUT_MS,
  );

  test(
    "a run past its timeout settles its reply with the timeout error",
    async () => {
      const { t, ids, startRun, rows } = await fixture();
      const { runId, chatId } = await startRun();
      await t.run((ctx) => ctx.db.patch(runId, { status: "running" }));

      await t.mutation(internal.taskWorkflow.handleStaleRun, {
        taskId: ids.taskId,
        runId,
      });
      const reply = (await rows(chatId)).find((m) => m.role === "assistant");
      expect(reply?.content.startsWith("Error: ")).toBe(true);
      expect(reply?.finishedAt).toBeDefined();
    },
    TIMEOUT_MS,
  );
});
