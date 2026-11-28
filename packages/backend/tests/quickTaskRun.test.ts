import { convexTest } from "convex-test";
import workflow from "@convex-dev/workflow/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import type { Doc } from "../convex/_generated/dataModel";
import { closeTurn, openSessionChatTurn } from "../convex/_chat/turnStore";
import { modules } from "./_helpers/convexModules";

const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|quick-task-run";

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
      defaultModel: "claude:opus",
    });
    const taskId = await ctx.db.insert("agentTasks", {
      repoId,
      title: "Clean up the flag",
      description: "Remove the never events flag.",
      status: "todo",
      numId: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    });
    return { userId, repoId, taskId };
  });
  const asUser = t.withIdentity({ subject: CLERK_ID });
  const status = () =>
    t.run(async (ctx) => (await ctx.db.get(ids.taskId))?.status);
  const facts = () =>
    asUser.query(api.agentTasks.getRunFacts, { taskId: ids.taskId });

  async function endTurn(
    taskRun: Doc<"turns">["taskRun"],
    state: "done" | "error" | "cancelled",
  ) {
    const { sessionId, chatId } = await asUser.mutation(
      api.sessions.ensureOwned,
      { owner: { kind: "task", taskId: ids.taskId } },
    );
    await t.run(async (ctx) => {
      const turnId = await openSessionChatTurn(ctx, {
        chatId,
        sessionId,
        streamingEntityId: String(chatId),
        model: "claude:opus",
        repoId: ids.repoId,
        taskRun,
      });
      const turn = await ctx.db.get(turnId);
      if (turn) await closeTurn(ctx, turn, state);
    });
  }

  const setStatus = (value: Doc<"agentTasks">["status"]) =>
    t.run((ctx) => ctx.db.patch(ids.taskId, { status: value }));

  return { t, ids, asUser, status, facts, endTurn, setStatus };
}

describe("a quick task's Run is a turn in its chat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test(
    "Run asks its chat for a task-mode turn",
    async () => {
      const { t, ids, asUser, status, facts } = await fixture();
      await asUser.mutation(api.agentTasks.startExecution, { id: ids.taskId });

      expect(await status()).toBe("in_progress");
      expect(await facts()).toMatchObject({ hasRuns: true, hasActiveRun: true });
      const queued = await t.run((ctx) =>
        ctx.db.query("queuedMessages").collect(),
      );
      expect(queued.map((row) => [row.displayContent, row.taskRun])).toEqual([
        [
          "Clean up the flag\n\nRemove the never events flag.",
          { mode: "implementation" },
        ],
      ]);
      expect(queued[0]?.content).toContain("IMPLEMENTATION MODE");

      await expect(
        asUser.mutation(api.agentTasks.startExecution, { id: ids.taskId }),
      ).rejects.toThrow("already has an active execution");
    },
    TIMEOUT_MS,
  );

  test(
    "a Run turn's end moves the card: Review on success, To Do otherwise",
    async () => {
      const { ids, asUser, status, endTurn, setStatus } = await fixture();
      const run: Doc<"turns">["taskRun"] = { mode: "implementation" };

      await setStatus("in_progress");
      await endTurn(run, "done");
      expect(await status()).toBe("business_review");

      await setStatus("in_progress");
      await endTurn(run, "cancelled");
      expect(await status()).toBe("todo");

      await setStatus("in_progress");
      await endTurn(run, "error");
      expect(await status()).toBe("todo");
      expect(
        await asUser.query(api.agentTasks.getTaskIdsWithFailedRun, {
          repoId: ids.repoId,
          taskIds: [ids.taskId],
        }),
      ).toEqual([ids.taskId]);
    },
    TIMEOUT_MS,
  );

  test(
    "a status picked during the Run stays, and a plain chat turn never moves the card",
    async () => {
      const { status, endTurn, setStatus } = await fixture();

      await setStatus("code_review");
      await endTurn({ mode: "implementation" }, "error");
      expect(await status()).toBe("code_review");

      await setStatus("in_progress");
      await endTurn(undefined, "done");
      expect(await status()).toBe("in_progress");
    },
    TIMEOUT_MS,
  );

  test(
    "a later chat reply clears the failed Run from the card",
    async () => {
      const { ids, asUser, endTurn, setStatus } = await fixture();
      await setStatus("in_progress");
      await endTurn({ mode: "implementation" }, "error");
      await endTurn(undefined, "done");
      expect(
        await asUser.query(api.agentTasks.getTaskIdsWithFailedRun, {
          repoId: ids.repoId,
          taskIds: [ids.taskId],
        }),
      ).toEqual([]);
    },
    TIMEOUT_MS,
  );
});
