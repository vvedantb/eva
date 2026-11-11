import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { recordPullRequest } from "../convex/_pullRequests/store";
import { findOpenTurn } from "../convex/_chat/turnStore";
import {
  decideSandboxStartPlan,
  SANDBOX_SURFACES,
} from "../convex/mcp/orchestratorDelivery";

/**
 * The entity tools an orchestrator drives between sends: what exists
 * (list_entities), whether the preview VM is up (start_sandbox/stop_sandbox),
 * and what is still waiting behind a busy turn (cancel_queued_message).
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the sandbox action module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;
const OWNER_CLERK_ID = "clerk|entity-tools-owner";
const TASK_PR_URL = "https://github.com/vvedantb/eva/pull/701";

/**
 * One repo the caller owns with a session, a quick task (plus the run holding
 * its PR) and a project, and a second repo owned by somebody else.
 */
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const ownerUserId = await ctx.db.insert("users", {
      clerkId: OWNER_CLERK_ID,
    });
    const strangerUserId = await ctx.db.insert("users", {});
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: ownerUserId,
    });
    const otherRepoId = await ctx.db.insert("githubRepos", {
      owner: "someone",
      name: "else",
      installationId: 2,
      connectedBy: strangerUserId,
    });

    const sessionId = await ctx.db.insert("sessions", {
      repoId,
      userId: ownerUserId,
      title: "Fix the login bug",
      status: "active",
      numId: 11,
      updatedAt: now - 1_000,
      branchName: "eva/session-login",
    });
    // The session's turn in flight.
    await ctx.db.insert("turns", {
      entityId: sessionId,
      streamingEntityId: String(sessionId),
      state: "running",
      open: true,
      turnStartedAt: now,
      leaseExpiresAt: now + 120_000,
      leaseGeneration: 1,
      model: "claude:sonnet",
      repoId,
      workflowId: "wf_session",
    });
    const closedSessionId = await ctx.db.insert("sessions", {
      repoId,
      userId: ownerUserId,
      title: "Old work",
      status: "closed",
      numId: 12,
      updatedAt: now - 5_000,
    });
    const taskId = await ctx.db.insert("agentTasks", {
      repoId,
      title: "Bump the deps",
      status: "code_review",
      numId: 21,
      createdAt: now,
      updatedAt: now - 2_000,
      createdBy: ownerUserId,
      reviewTaskSandboxStatus: "active",
    });
    const runId = await ctx.db.insert("agentRuns", {
      taskId,
      status: "success",
      logs: [],
    });
    await recordPullRequest(ctx, {
      owner: { kind: "task", taskId, runId },
      repoId,
      prUrl: TASK_PR_URL,
      state: "draft",
      primary: true,
      origin: "eva",
    });
    const projectId = await ctx.db.insert("projects", {
      repoId,
      userId: ownerUserId,
      title: "Billing revamp",
      phase: "in_progress",
      rawInput: "revamp billing",
      numId: 31,
      updatedAt: now - 3_000,
    });
    const strangerSessionId = await ctx.db.insert("sessions", {
      repoId: otherRepoId,
      userId: strangerUserId,
      title: "Not yours",
      status: "active",
      numId: 1,
    });

    return {
      ownerUserId,
      strangerUserId,
      repoId,
      otherRepoId,
      sessionId,
      closedSessionId,
      taskId,
      projectId,
      strangerSessionId,
    };
  });
  return { t, ...ids };
}

/**
 * Runs `body` with only `setTimeout` faked, so the teardown/startup actions
 * `convex-test` schedules on a zero delay never fire. Without this the
 * assertion races a provider call that cannot succeed in a test, and the
 * status under test is overwritten by that call's failure path.
 */
async function withoutRunningScheduledWork<T>(
  body: () => Promise<T>,
): Promise<T> {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  try {
    return await body();
  } finally {
    vi.useRealTimers();
  }
}

function listFor(
  f: Awaited<ReturnType<typeof fixture>>,
  args: {
    userId?: string;
    repoIds?: string[];
    kind?: "session" | "task" | "project";
    status?: string;
    limit?: number;
  } = {},
) {
  return f.t.query(internal.mcp.queries.listEntitiesForUser, {
    userId: args.userId ?? f.ownerUserId,
    repoIds: args.repoIds ?? [f.repoId],
    kind: args.kind,
    status: args.status,
    limit: args.limit ?? 25,
  });
}

describe("list_entities returns what the caller can already open", () => {
  test("all three surfaces come back, most recently updated first", async () => {
    const f = await fixture();
    const { entities, truncated } = await listFor(f);

    expect(truncated).toBe(false);
    expect(entities.map((entity) => entity.id)).toEqual([
      f.sessionId,
      f.taskId,
      f.projectId,
      f.closedSessionId,
    ]);
    expect(entities.map((entity) => entity.kind)).toEqual([
      "session",
      "task",
      "project",
      "session",
    ]);
    for (const entity of entities) {
      expect(entity.repoOwner).toBe("vvedantb");
      expect(entity.repoName).toBe("eva");
    }
  });

  test("each row carries the sandbox state and the turn-in-flight flag", async () => {
    const f = await fixture();
    const { entities } = await listFor(f);
    const byId = new Map(entities.map((entity) => [entity.id, entity]));

    // A session's one status IS its sandbox status.
    expect(byId.get(f.sessionId)?.status).toBe("active");
    expect(byId.get(f.sessionId)?.sandboxStatus).toBe("active");
    expect(byId.get(f.sessionId)?.isExecuting).toBe(true);

    // A task tracks lifecycle and sandbox separately.
    expect(byId.get(f.taskId)?.status).toBe("code_review");
    expect(byId.get(f.taskId)?.sandboxStatus).toBe("active");
    expect(byId.get(f.taskId)?.isExecuting).toBe(false);

    // A project reports its phase, and has never started a sandbox.
    expect(byId.get(f.projectId)?.status).toBe("in_progress");
    expect(byId.get(f.projectId)?.sandboxStatus).toBe("closed");
  });

  test("a quick task reports the PR its run opened", async () => {
    const f = await fixture();
    const { entities } = await listFor(f, { kind: "task" });
    expect(entities).toHaveLength(1);
    expect(entities[0]?.prUrl).toBe(TASK_PR_URL);
  });

  test("kind narrows to one surface", async () => {
    const f = await fixture();
    for (const kind of ["session", "task", "project"] as const) {
      const { entities } = await listFor(f, { kind });
      expect(entities.every((entity) => entity.kind === kind)).toBe(true);
      expect(entities.length).toBeGreaterThan(0);
    }
  });

  test("status filters against each surface's own vocabulary", async () => {
    const f = await fixture();

    expect(
      (await listFor(f, { status: "closed" })).entities.map((e) => e.id),
    ).toEqual([f.closedSessionId]);
    expect(
      (await listFor(f, { status: "code_review" })).entities.map((e) => e.id),
    ).toEqual([f.taskId]);
    expect(
      (await listFor(f, { status: "in_progress" })).entities.map((e) => e.id),
    ).toEqual([f.projectId]);

    // "active" is a session word. Tasks and projects never match it, rather
    // than the filter being silently ignored for them.
    expect(
      (await listFor(f, { status: "active", kind: "task" })).entities,
    ).toEqual([]);
    expect((await listFor(f, { status: "nonsense" })).entities).toEqual([]);
  });

  test("limit caps the page and says so", async () => {
    const f = await fixture();
    const { entities, truncated } = await listFor(f, { limit: 2 });
    expect(entities.map((entity) => entity.id)).toEqual([
      f.sessionId,
      f.taskId,
    ]);
    expect(truncated).toBe(true);
  });

  test("soft-deleted rows are not listed", async () => {
    const f = await fixture();
    await f.t.run(async (ctx) => {
      const deletedAt = Date.now();
      await ctx.db.patch(f.sessionId, { deletedAt });
      await ctx.db.patch(f.taskId, { deletedAt });
      await ctx.db.patch(f.projectId, { deletedAt });
    });

    const ids = (await listFor(f)).entities.map((entity) => entity.id);
    expect(ids).toEqual([f.closedSessionId]);
    // Also gone from the per-status path, which uses different indexes.
    expect((await listFor(f, { status: "code_review" })).entities).toEqual([]);
  });
});

describe("list_entities never leaks another user's work", () => {
  test("naming a repo the caller cannot reach returns nothing", async () => {
    const f = await fixture();
    const { entities } = await listFor(f, { repoIds: [f.otherRepoId] });
    expect(entities).toEqual([]);
  });

  test("an unreachable repo is dropped from a mixed scan, not the whole page", async () => {
    const f = await fixture();
    const { entities } = await listFor(f, {
      repoIds: [f.repoId, f.otherRepoId],
    });
    expect(entities.map((entity) => entity.id)).not.toContain(
      f.strangerSessionId,
    );
    expect(entities.length).toBe(4);
  });

  test("a bogus or malformed user id lists nothing", async () => {
    const f = await fixture();
    expect(await listFor(f, { userId: "not-an-id" })).toEqual({
      entities: [],
      truncated: false,
    });
  });

  test("a teammate on the repo's team sees the same page", async () => {
    const f = await fixture();
    const teammateUserId = await f.t.run(async (ctx) => {
      const teamId = await ctx.db.insert("teams", {
        name: "Eva",
        createdBy: f.ownerUserId,
        createdAt: Date.now(),
      });
      await ctx.db.patch(f.repoId, { teamId });
      const userId = await ctx.db.insert("users", {});
      await ctx.db.insert("teamMembers", {
        teamId,
        userId,
        role: "member",
        joinedAt: Date.now(),
      });
      return userId;
    });

    const { entities } = await listFor(f, { userId: teammateUserId });
    expect(entities.map((entity) => entity.id)).toContain(f.taskId);
  });
});

describe("start_sandbox and stop_sandbox drive the Eva Start/Stop buttons", () => {
  test("each surface is mapped to the mutation its button calls", () => {
    expect(SANDBOX_SURFACES).toEqual({
      session: {
        idArg: "sessionId",
        start: "sessions:startSandbox",
        stop: "sessions:stopSandbox",
      },
      task: {
        idArg: "taskId",
        start: "agentTasks:startTaskSandbox",
        stop: "agentTasks:stopTaskSandbox",
      },
      project: {
        idArg: "projectId",
        start: "projects:startProjectSandbox",
        stop: "projects:stopProjectSandbox",
      },
    });
  });

  test("only an active sandbox is ready; an in-flight one is waited on", () => {
    expect(decideSandboxStartPlan("active")).toBe("run");
    expect(decideSandboxStartPlan("starting")).toBe("wait");
    expect(decideSandboxStartPlan("stopping")).toBe("wait");
    expect(decideSandboxStartPlan("closed")).toBe("start");
    expect(decideSandboxStartPlan(undefined)).toBe("start");
  });

  test(
    "starting a task from closed moves it to starting",
    async () => {
      const f = await fixture();
      const closedTaskId = await f.t.run(async (ctx) => {
        const now = Date.now();
        return ctx.db.insert("agentTasks", {
          repoId: f.repoId,
          title: "Closed sandbox",
          status: "business_review",
          numId: 22,
          createdAt: now,
          updatedAt: now,
          createdBy: f.ownerUserId,
          // A resumable sandbox id takes the direct-start path rather than
          // scheduling the whole startup workflow.
          sandboxId: "sbx_closed",
          reviewTaskSandboxStatus: "closed",
        });
      });

      const after = await withoutRunningScheduledWork(async () => {
        await f.t
          .withIdentity({ subject: OWNER_CLERK_ID })
          .mutation(api.agentTasks.startTaskSandbox, { taskId: closedTaskId });
        return f.t.run(async (ctx) => ctx.db.get(closedTaskId));
      });

      expect(after?.reviewTaskSandboxStatus).toBe("starting");
      // The resumable id is kept, so the paused filesystem comes back.
      expect(after?.sandboxId).toBe("sbx_closed");
    },
    TIMEOUT_MS,
  );

  test(
    "stopping a task from active moves it to stopping, keeping the sandbox id",
    async () => {
      const f = await fixture();
      await f.t.run(async (ctx) => {
        await ctx.db.patch(f.taskId, { sandboxId: "sbx_live" });
      });

      const after = await withoutRunningScheduledWork(async () => {
        await f.t
          .withIdentity({ subject: OWNER_CLERK_ID })
          .mutation(api.agentTasks.stopTaskSandbox, { taskId: f.taskId });
        return f.t.run(async (ctx) => ctx.db.get(f.taskId));
      });

      expect(after?.reviewTaskSandboxStatus).toBe("stopping");
      // Kept so the same paused filesystem can be resumed by a later start.
      expect(after?.sandboxId).toBe("sbx_live");
    },
    TIMEOUT_MS,
  );

  test(
    "stopping a task that never had a sandbox closes it outright",
    async () => {
      const f = await fixture();
      await f.t
        .withIdentity({ subject: OWNER_CLERK_ID })
        .mutation(api.agentTasks.stopTaskSandbox, { taskId: f.taskId });

      const after = await f.t.run(async (ctx) => ctx.db.get(f.taskId));
      expect(after?.reviewTaskSandboxStatus).toBe("closed");
    },
    TIMEOUT_MS,
  );

  test("a session running a daemon continuation counts as executing", async () => {
    const f = await fixture();
    // A `/loop` turn: an open row in `turns` with no workflow bound.
    const loopingSessionId = await f.t.run(async (ctx) => {
      const sessionId = await ctx.db.insert("sessions", {
        repoId: f.repoId,
        userId: f.ownerUserId,
        title: "Looping",
        status: "active",
        numId: 13,
      });
      await ctx.db.insert("turns", {
        entityId: sessionId,
        streamingEntityId: String(sessionId),
        state: "running",
        open: true,
        turnStartedAt: Date.now(),
        leaseExpiresAt: Date.now() + 120_000,
        leaseGeneration: 1,
        model: "claude:sonnet",
        repoId: f.repoId,
      });
      return sessionId;
    });

    expect(
      await f.t.query(internal.mcp.queries.entityIsExecuting, {
        kind: "session",
        id: loopingSessionId,
      }),
    ).toBe(true);
    // And an idle session with neither is not.
    expect(
      await f.t.query(internal.mcp.queries.entityIsExecuting, {
        kind: "session",
        id: f.closedSessionId,
      }),
    ).toBe(false);
    // The list agrees with the single-entity answer.
    const listed = (await listFor(f)).entities.find(
      (entity) => entity.id === loopingSessionId,
    );
    expect(listed?.isExecuting).toBe(true);
  });

  test("a task and a project report their own workflow slots", async () => {
    const f = await fixture();
    await f.t.run(async (ctx) => {
      await ctx.db.patch(f.taskId, { activeChatWorkflowId: "wf_task_chat" });
      await ctx.db.patch(f.projectId, {
        build: { state: "running", workflowId: "wf_project_build" },
      });
    });

    for (const [kind, id] of [
      ["task", f.taskId],
      ["project", f.projectId],
    ] as const) {
      expect(
        await f.t.query(internal.mcp.queries.entityIsExecuting, { kind, id }),
      ).toBe(true);
    }
  });
});

describe("cancel_queued_message only touches the queue", () => {
  async function queueFixture() {
    const f = await fixture();
    const queuedIds = await f.t.run(async (ctx) => {
      const now = Date.now();
      const first = await ctx.db.insert("queuedMessages", {
        parentId: f.sessionId,
        content: "first follow-up",
        createdAt: now,
        order: 0,
        userId: f.ownerUserId,
      });
      const second = await ctx.db.insert("queuedMessages", {
        parentId: f.sessionId,
        content: "second follow-up",
        createdAt: now + 1,
        order: 1,
        userId: f.ownerUserId,
      });
      return [first, second];
    });
    return { ...f, queuedIds };
  }

  test("removing one queued message leaves the rest and the running turn alone", async () => {
    const f = await queueFixture();
    const asOwner = f.t.withIdentity({ subject: OWNER_CLERK_ID });

    await asOwner.mutation(api.queuedMessages.remove, { id: f.queuedIds[0] });

    const remaining = await asOwner.query(api.queuedMessages.listByParent, {
      parentId: f.sessionId,
    });
    expect(remaining.map((message) => message._id)).toEqual([f.queuedIds[1]]);

    // The turn in flight is untouched — that is stop_agent's job, not this.
    const turn = await f.t.run(async (ctx) => findOpenTurn(ctx, f.sessionId));
    expect(turn?.workflowId).toBe("wf_session");
  });

  test("clearing every pending message empties the queue", async () => {
    const f = await queueFixture();
    const asOwner = f.t.withIdentity({ subject: OWNER_CLERK_ID });

    for (const id of f.queuedIds) {
      await asOwner.mutation(api.queuedMessages.remove, { id });
    }

    expect(
      await asOwner.query(api.queuedMessages.listByParent, {
        parentId: f.sessionId,
      }),
    ).toEqual([]);
  });

  test("a user with no access to the repo cannot cancel or even see the queue", async () => {
    const f = await queueFixture();
    const strangerClerkId = "clerk|entity-tools-stranger";
    await f.t.run(async (ctx) => {
      await ctx.db.patch(f.strangerUserId, { clerkId: strangerClerkId });
    });
    const asStranger = f.t.withIdentity({ subject: strangerClerkId });

    await expect(
      asStranger.mutation(api.queuedMessages.remove, { id: f.queuedIds[0] }),
    ).rejects.toThrow(/Not authorized/);
    expect(
      await asStranger.query(api.queuedMessages.listByParent, {
        parentId: f.sessionId,
      }),
    ).toEqual([]);

    // And nothing was deleted on the way to being refused.
    const survivors = await f.t.run(async (ctx) =>
      ctx.db
        .query("queuedMessages")
        .withIndex("by_parent_and_order", (q) => q.eq("parentId", f.sessionId))
        .collect(),
    );
    expect(survivors).toHaveLength(2);
  });
});

/**
 * 2026-09-24: asked "give me the link then?", a session answered that no link
 * existed and offered to merge the PR — its own sandbox was serving the work
 * the whole time. `get_preview_url` closes that gap, so what it needs to
 * answer has to travel with the resolved chat.
 */
describe("get_preview_url can find the running app behind a chat", () => {
  async function resolve(
    f: Awaited<ReturnType<typeof fixture>>,
    kind: "session" | "task" | "project",
    id: string,
  ) {
    return f.t.query(internal.mcp.queries.resolveChatTargetForUser, {
      userId: f.ownerUserId,
      kind,
      id,
    });
  }

  test("a resolved chat carries its sandbox, its VM state and its dev port", async () => {
    const f = await fixture();
    await f.t.run(async (ctx) => {
      await ctx.db.patch(f.repoId, { devPort: 3000 });
      await ctx.db.patch(f.sessionId, {
        sandboxId: "sbx_session",
        devPort: 5173,
      });
      await ctx.db.patch(f.taskId, { sandboxId: "sbx_task" });
    });

    // A session's own status is its sandbox's, and its port beats the repo's.
    const session = await resolve(f, "session", f.sessionId);
    expect(session?.sandboxStatus).toBe("active");
    expect(session?.sandboxId).toBe("sbx_session");
    expect(session?.devPort).toBe(5173);

    // A task parks the reviewer-facing VM state in its own field, and has no
    // port of its own — the repo default answers for it.
    const task = await resolve(f, "task", f.taskId);
    expect(task?.sandboxStatus).toBe("active");
    expect(task?.sandboxId).toBe("sbx_task");
    expect(task?.devPort).toBe(3000);

    // A project that never started one reports closed rather than nothing.
    const project = await resolve(f, "project", f.projectId);
    expect(project?.sandboxStatus).toBe("closed");
    expect(project?.sandboxId).toBeUndefined();
  });
});
