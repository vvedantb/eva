import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * A daemon that holds a durable lease appends `turnId` and `leaseGeneration`
 * to every completion it posts. Task and project chats must accept both
 * before any daemon holds a task or project lease: a closed validator rejects
 * the whole call, the reply is lost and the turn hangs on "Working…".
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the chat workflow module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|fence-args";

const completion = {
  success: true,
  result: "done",
  error: null,
  activityLog: null,
  turnId: "turn-from-a-later-daemon",
  leaseGeneration: 3,
};

async function createFixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "eva",
      name: "fence-args-test",
      installationId: 1,
    });
    const now = Date.now();
    const taskId = await ctx.db.insert("agentTasks", {
      repoId,
      title: "Fence args",
      status: "code_review",
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    });
    const projectId = await ctx.db.insert("projects", {
      repoId,
      userId,
      title: "Fence args",
      phase: "in_progress",
      rawInput: "fence args",
      updatedAt: now,
    });
    const taskMessageId = await ctx.db.insert("messages", {
      parentId: taskId,
      role: "assistant",
      content: "",
      timestamp: now,
    });
    const projectMessageId = await ctx.db.insert("messages", {
      parentId: projectId,
      role: "assistant",
      content: "",
      timestamp: now,
    });
    return { taskId, projectId, taskMessageId, projectMessageId };
  });
  return { t: t.withIdentity({ subject: CLERK_ID }), ...ids };
}

describe("task and project chats accept fenced completions", () => {
  test("handleCompletion accepts the lease fence on both surfaces", async () => {
    const { t, taskId, projectId } = await createFixture();
    await expect(
      t.mutation(api.agentTaskChatWorkflow.handleCompletion, {
        taskId,
        ...completion,
      }),
    ).resolves.toBeNull();
    await expect(
      t.mutation(api.projectChatWorkflow.handleCompletion, {
        projectId,
        ...completion,
      }),
    ).resolves.toBeNull();
  }, TIMEOUT_MS);

  test("completeSyntheticTurn accepts the lease fence and still finishes the reply", async () => {
    const { t, taskId, projectId, taskMessageId, projectMessageId } =
      await createFixture();
    await t.mutation(api._chat.taskChatDaemon.completeSyntheticTurn, {
      taskId,
      messageId: taskMessageId,
      ...completion,
    });
    await t.mutation(api._chat.projectChatDaemon.completeSyntheticTurn, {
      projectId,
      messageId: projectMessageId,
      ...completion,
    });

    // The fence is ignored for now: the reply lands exactly as before.
    const messages = await t.run(async (ctx) => [
      await ctx.db.get(taskMessageId),
      await ctx.db.get(projectMessageId),
    ]);
    for (const message of messages) {
      expect(message?.content).toBe("done");
      expect(message?.finishedAt).toBeGreaterThan(0);
    }
  }, TIMEOUT_MS);
});
