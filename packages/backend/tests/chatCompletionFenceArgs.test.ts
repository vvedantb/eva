import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { acquireTurnLease, openChatTurn } from "../convex/_chat/turnStore";

/**
 * Task and project chats run on durable turns: completions carry the lease
 * fence, a stale fence is dropped, and every exit (reply, synthetic reply,
 * cancel) closes the turn so the reconciler never tears it down twice.
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the chat workflow module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|fence-args";
const MODEL = "claude:sonnet";

const reply = {
  success: true,
  result: "done",
  error: null,
  activityLog: null,
};

type ChatSurface = "task" | "project";

async function createFixture(surface: ChatSurface) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "eva",
      name: "fence-args-test",
      installationId: 1,
      connectedBy: userId,
    });
    const now = Date.now();
    const entity =
      surface === "task"
        ? {
            surface: "task" as const,
            id: await ctx.db.insert("agentTasks", {
              repoId,
              title: "Fence args",
              status: "code_review",
              createdAt: now,
              updatedAt: now,
              createdBy: userId,
              lastChatModel: MODEL,
            }),
          }
        : {
            surface: "project" as const,
            id: await ctx.db.insert("projects", {
              repoId,
              userId,
              title: "Fence args",
              phase: "in_progress",
              rawInput: "fence args",
              updatedAt: now,
              lastChatModel: MODEL,
            }),
          };
    return { entity, repoId };
  });
  const authed = t.withIdentity({ subject: CLERK_ID });
  const { entity } = ids;

  /** Stages a turn the way `stageAndStart*ChatTurn` does. */
  const stageTurn = () =>
    t.run(async (ctx) => {
      const placeholderMessageId = await ctx.db.insert("messages", {
        parentId: entity.id,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      });
      const turnId = await openChatTurn(ctx, {
        entityId: entity.id,
        streamingEntityId: `${surface}-chat-${entity.id}`,
        placeholderMessageId,
        prompt: "hi",
        model: MODEL,
        repoId: ids.repoId,
      });
      await ctx.db.patch(entity.id, {
        activeChatWorkflowId: "chat-workflow",
        pendingTurn: { prompt: "hi", requestedAt: Date.now(), turnId },
      });
      return { turnId, placeholderMessageId };
    });

  const openSynthetic = () =>
    entity.surface === "task"
      ? authed.mutation(api._chat.taskChatDaemon.openSyntheticTurn, {
          taskId: entity.id,
          model: MODEL,
        })
      : authed.mutation(api._chat.projectChatDaemon.openSyntheticTurn, {
          projectId: entity.id,
          model: MODEL,
        });

  const completeSynthetic = (
    messageId: string,
    fence: { turnId?: string; leaseGeneration?: number },
  ) =>
    t
      .run(async (ctx) => ctx.db.normalizeId("messages", messageId))
      .then((id) => {
        if (!id) throw new Error("missing message");
        return entity.surface === "task"
          ? authed.mutation(api._chat.taskChatDaemon.completeSyntheticTurn, {
              taskId: entity.id,
              messageId: id,
              ...reply,
              ...fence,
            })
          : authed.mutation(api._chat.projectChatDaemon.completeSyntheticTurn, {
              projectId: entity.id,
              messageId: id,
              ...reply,
              ...fence,
            });
      });

  const handleCompletion = (fence: {
    turnId?: string;
    leaseGeneration?: number;
  }) =>
    entity.surface === "task"
      ? authed.mutation(api.agentTaskChatWorkflow.handleCompletion, {
          taskId: entity.id,
          ...reply,
          ...fence,
        })
      : authed.mutation(api.projectChatWorkflow.handleCompletion, {
          projectId: entity.id,
          ...reply,
          ...fence,
        });

  const saveResult = (turnId: string, success: boolean) =>
    t
      .run(async (ctx) => ctx.db.normalizeId("turns", turnId))
      .then((id) => {
        if (!id) throw new Error("missing turn");
        const args = {
          turnId: id,
          ...reply,
          success,
          error: success ? null : "agent failed",
        };
        return entity.surface === "task"
          ? t.mutation(internal.agentTaskChatWorkflow.saveResult, {
              taskId: entity.id,
              ...args,
            })
          : t.mutation(internal.projectChatWorkflow.saveResult, {
              projectId: entity.id,
              ...args,
            });
      });

  const restage = () =>
    entity.surface === "task"
      ? t.mutation(internal.agentTaskChatWorkflow.ensurePendingTurn, {
          taskId: entity.id,
          prompt: "restaged",
          model: MODEL,
        })
      : t.mutation(internal.projectChatWorkflow.ensurePendingTurn, {
          projectId: entity.id,
          prompt: "restaged",
          model: MODEL,
        });

  const cancel = () =>
    entity.surface === "task"
      ? authed.mutation(api.agentTaskChatWorkflow.cancelExecution, {
          taskId: entity.id,
        })
      : authed.mutation(api.projectChatWorkflow.cancelExecution, {
          projectId: entity.id,
        });

  const readTurn = (turnId: string) =>
    t.run(async (ctx) => {
      const id = ctx.db.normalizeId("turns", turnId);
      return id ? await ctx.db.get(id) : null;
    });

  const readMessage = (messageId: string) =>
    t.run(async (ctx) => {
      const id = ctx.db.normalizeId("messages", messageId);
      return id ? await ctx.db.get(id) : null;
    });

  const readEntity = () => t.run(async (ctx) => await ctx.db.get(entity.id));

  return {
    t,
    entity,
    repoId: ids.repoId,
    stageTurn,
    openSynthetic,
    completeSynthetic,
    handleCompletion,
    saveResult,
    cancel,
    restage,
    readTurn,
    readMessage,
    readEntity,
  };
}

describe.each<ChatSurface>(["task", "project"])(
  "%s chat durable turns",
  (surface) => {
    test(
      "a synthetic turn opens leased and closes done on a fenced completion",
      async () => {
        const f = await createFixture(surface);

        const opened = await f.openSynthetic();
        expect(opened.leaseGeneration).toBe(1);
        expect((await f.readTurn(opened.turnId))?.state).toBe("running");
        expect((await f.readEntity())?.chatTurnLifecycleVersion).toBe(2);

        await f.completeSynthetic(opened.messageId, {
          turnId: opened.turnId,
          leaseGeneration: opened.leaseGeneration,
        });

        const turn = await f.readTurn(opened.turnId);
        expect(turn?.state).toBe("done");
        expect(turn?.open).toBe(false);
        const message = await f.readMessage(opened.messageId);
        expect(message?.content).toBe("done");
        expect(message?.finishedAt).toBeGreaterThan(0);
        expect((await f.readEntity())?.syntheticTurnMessageId).toBeUndefined();
      },
      TIMEOUT_MS,
    );

    test(
      "a synthetic completion from a superseded lease is dropped",
      async () => {
        const f = await createFixture(surface);
        const opened = await f.openSynthetic();

        await f.completeSynthetic(opened.messageId, {
          turnId: opened.turnId,
          leaseGeneration: opened.leaseGeneration - 1,
        });

        expect((await f.readTurn(opened.turnId))?.open).toBe(true);
        expect(
          (await f.readMessage(opened.messageId))?.finishedAt,
        ).toBeUndefined();
      },
      TIMEOUT_MS,
    );

    test(
      "an unfenced synthetic completion with no durable turn still lands",
      async () => {
        // A synthetic turn a legacy daemon opened before the cutover has no row.
        const f = await createFixture(surface);
        const messageId = await f.t.run(async (ctx) =>
          ctx.db.insert("messages", {
            parentId: f.entity.id,
            role: "assistant",
            content: "",
            timestamp: Date.now(),
          }),
        );

        await f.completeSynthetic(messageId, {});

        expect((await f.readMessage(messageId))?.content).toBe("done");
      },
      TIMEOUT_MS,
    );

    test(
      "a completion with a stale fence leaves the turn and staged prompt alone",
      async () => {
        const f = await createFixture(surface);
        const { turnId } = await f.stageTurn();
        await f.t.run(async (ctx) => {
          const turn = await ctx.db.get(turnId);
          if (turn) await acquireTurnLease(ctx, turn, "running");
        });

        await expect(
          f.handleCompletion({ turnId, leaseGeneration: 0 }),
        ).resolves.toBeNull();
        await expect(f.handleCompletion({})).resolves.toBeNull();

        const turn = await f.readTurn(turnId);
        expect(turn?.state).toBe("running");
        expect((await f.readEntity())?.pendingTurn?.prompt).toBe("hi");
      },
      TIMEOUT_MS,
    );

    test(
      "saveResult closes the turn done on success and error on failure",
      async () => {
        const f = await createFixture(surface);
        const first = await f.stageTurn();
        await f.saveResult(first.turnId, true);
        expect((await f.readTurn(first.turnId))?.state).toBe("done");

        const second = await f.stageTurn();
        await f.saveResult(second.turnId, false);
        const failed = await f.readTurn(second.turnId);
        expect(failed?.state).toBe("error");
        expect(failed?.error).toBe("agent failed");
      },
      TIMEOUT_MS,
    );

    test(
      "restage replaces an orphan slot and carries the open turn id",
      async () => {
        // A queued turn opens a new durable turn while the slot still names a
        // closed one. The orphan must not block the restage, or no daemon can
        // claim the new turn until its startup lease runs out.
        const f = await createFixture(surface);
        await f.stageTurn();
        const turnId = await f.t.run(async (ctx) => {
          const placeholderMessageId = await ctx.db.insert("messages", {
            parentId: f.entity.id,
            role: "assistant",
            content: "",
            timestamp: Date.now(),
          });
          return await openChatTurn(ctx, {
            entityId: f.entity.id,
            streamingEntityId: `${surface}-chat-${f.entity.id}`,
            placeholderMessageId,
            prompt: "queued",
            model: MODEL,
            repoId: f.repoId,
          });
        });

        await f.restage();

        const pending = (await f.readEntity())?.pendingTurn;
        expect(pending?.prompt).toBe("restaged");
        expect(pending?.turnId).toBe(turnId);
      },
      TIMEOUT_MS,
    );

    test(
      "cancel closes the open turn as cancelled",
      async () => {
        const f = await createFixture(surface);
        const { turnId } = await f.stageTurn();
        // No real workflow to cancel in convex-test: the turn is staged only.
        await f.t.run(async (ctx) =>
          ctx.db.patch(f.entity.id, { activeChatWorkflowId: undefined }),
        );

        await f.cancel();

        const turn = await f.readTurn(turnId);
        expect(turn?.state).toBe("cancelled");
        expect(turn?.open).toBe(false);
      },
      TIMEOUT_MS,
    );
  },
);

/**
 * Durable-turns Phase 6 groundwork: a run daemon that holds a lease sends the
 * fence on its completion. The receiver must accept it before any run opens a
 * turn, or the validator throws and the run's reply is lost.
 */
test(
  "the quick-task run completion accepts the lease fence",
  async () => {
    const f = await createFixture("task");
    if (f.entity.surface !== "task") throw new Error("task fixture expected");
    const taskId = f.entity.id;
    const runId = await f.t.run(async (ctx) =>
      ctx.db.insert("agentRuns", { taskId, status: "running", logs: [] }),
    );

    await expect(
      f.t
        .withIdentity({ subject: CLERK_ID })
        .mutation(api.taskWorkflow.handleCompletion, {
          taskId,
          runId,
          ...reply,
          turnId: "turn-from-a-leased-run",
          leaseGeneration: 1,
        }),
    ).resolves.toBeNull();
  },
  TIMEOUT_MS,
);
