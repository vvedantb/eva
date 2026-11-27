import { convexTest } from "convex-test";
import { describe, expect, test } from "bun:test";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { recordPullRequest } from "../convex/_pullRequests/store";
import { findOpenTurn } from "../convex/_chat/turnStore";
import { decideSandboxStartPlan } from "../convex/mcp/orchestratorDelivery";
import { modules } from "./_helpers/convexModules";


const OWNER_CLERK_ID = "clerk|entity-tools-owner";
const TASK_PR_URL = "https://github.com/vvedantb/eva/pull/701";

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
      owner: { kind: "standalone" },
      repoId,
      userId: ownerUserId,
      title: "Fix the login bug",
      status: "active",
      numId: 11,
      updatedAt: now - 1_000,
      branchName: "eva/session-login",
    });
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
      owner: { kind: "standalone" },
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
    });
    const taskSessionId = await ctx.db.insert("sessions", {
      owner: { kind: "task", taskId },
      repoId,
      userId: ownerUserId,
      title: "Bump the deps",
      status: "active",
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
      rawInput: "revamp billing",
      numId: 31,
      updatedAt: now - 3_000,
    });
    const strangerSessionId = await ctx.db.insert("sessions", {
      owner: { kind: "standalone" },
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
      taskSessionId,
      projectId,
      strangerSessionId,
    };
  });
  return { t, ...ids };
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

    expect(byId.get(f.sessionId)?.status).toBe("active");
    expect(byId.get(f.sessionId)?.sandboxStatus).toBe("active");
    expect(byId.get(f.sessionId)?.isExecuting).toBe(true);

    expect(byId.get(f.taskId)?.status).toBe("code_review");
    expect(byId.get(f.taskId)?.sandboxStatus).toBe("active");
    expect(byId.get(f.taskId)?.isExecuting).toBe(false);

    expect(byId.get(f.projectId)?.status).toBe("todo");
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
      (await listFor(f, { status: "todo", kind: "project" })).entities.map(
        (e) => e.id,
      ),
    ).toEqual([f.projectId]);
    expect(
      (await listFor(f, { status: "in_progress", kind: "project" })).entities,
    ).toEqual([]);

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

  test("deleted sessions and archived tasks and projects are not listed", async () => {
    const f = await fixture();
    await f.t.run(async (ctx) => {
      const at = Date.now();
      await ctx.db.patch(f.sessionId, { deletedAt: at });
      await ctx.db.patch(f.taskId, { archivedAt: at });
      await ctx.db.patch(f.projectId, { archivedAt: at });
    });

    const ids = (await listFor(f)).entities.map((entity) => entity.id);
    expect(ids).toEqual([f.closedSessionId]);
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
  test("only an active sandbox is ready; an in-flight one is waited on", () => {
    expect(decideSandboxStartPlan("active")).toBe("run");
    expect(decideSandboxStartPlan("starting")).toBe("wait");
    expect(decideSandboxStartPlan("stopping")).toBe("wait");
    expect(decideSandboxStartPlan("closed")).toBe("start");
    expect(decideSandboxStartPlan(undefined)).toBe("start");
  });

  test("a session running a daemon continuation counts as executing", async () => {
    const f = await fixture();
    const loopingSessionId = await f.t.run(async (ctx) => {
      const sessionId = await ctx.db.insert("sessions", {
        owner: { kind: "standalone" },
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
    expect(
      await f.t.query(internal.mcp.queries.entityIsExecuting, {
        kind: "session",
        id: f.closedSessionId,
      }),
    ).toBe(false);
    const listed = (await listFor(f)).entities.find(
      (entity) => entity.id === loopingSessionId,
    );
    expect(listed?.isExecuting).toBe(true);
  });

  test("a task reports its run; a project only its coordinator chat", async () => {
    const f = await fixture();
    await f.t.run(async (ctx) => {
      await ctx.db.patch(f.taskId, {
        run: { state: "running", workflowId: "wf_task_run" },
      });
    });

    expect(
      await f.t.query(internal.mcp.queries.entityIsExecuting, {
        kind: "task",
        id: f.taskId,
      }),
    ).toBe(true);
    expect(
      await f.t.query(internal.mcp.queries.entityIsExecuting, {
        kind: "project",
        id: f.projectId,
      }),
    ).toBe(false);
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

    const survivors = await f.t.run(async (ctx) =>
      ctx.db
        .query("queuedMessages")
        .withIndex("by_parent_and_order", (q) => q.eq("parentId", f.sessionId))
        .collect(),
    );
    expect(survivors).toHaveLength(2);
  });
});

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
      await ctx.db.patch(f.taskSessionId, { sandboxId: "sbx_task" });
    });

    const session = await resolve(f, "session", f.sessionId);
    expect(session?.sandboxStatus).toBe("active");
    expect(session?.sandboxId).toBe("sbx_session");
    expect(session?.devPort).toBe(5173);

    const task = await resolve(f, "task", f.taskId);
    expect(task?.sandboxStatus).toBe("active");
    expect(task?.sandboxId).toBe("sbx_task");
    expect(task?.devPort).toBe(3000);

    const project = await resolve(f, "project", f.projectId);
    expect(project?.sandboxStatus).toBe("closed");
    expect(project?.sandboxId).toBeUndefined();
  });
});
