import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import {
  decideSandboxStartPlan,
  SANDBOX_SURFACES,
} from "../convex/mcp/orchestratorDelivery";

/**
 * The entity tools an orchestrator drives between sends: what exists
 * (list_entities), whether the preview VM is up (start_sandbox/stop_sandbox),
 * and what is still waiting behind a busy turn (cancel_queued_message).
 *
 * None of them may write status or review state — that stays a person's call —
 * so the last describe here pins the absence as hard as the presence.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const testsDir = dirname(fileURLToPath(import.meta.url));

function convexSource(path: string): string {
  return readFileSync(join(testsDir, "../convex", path), "utf8");
}

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
      activeWorkflowId: "wf_session",
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
    await ctx.db.insert("agentRuns", {
      taskId,
      status: "success",
      logs: [],
      prUrl: TASK_PR_URL,
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

  test("a quick task's PR is read off the run that opened it", async () => {
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
    expect(
      (await listFor(f, { status: "code_review" })).entities,
    ).toEqual([]);
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

  test("starting a task from closed moves it to starting", async () => {
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
  }, TIMEOUT_MS);

  test("stopping a task from active moves it to stopping, keeping the sandbox id", async () => {
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
  }, TIMEOUT_MS);

  test("stopping a task that never had a sandbox closes it outright", async () => {
    const f = await fixture();
    await f.t
      .withIdentity({ subject: OWNER_CLERK_ID })
      .mutation(api.agentTasks.stopTaskSandbox, { taskId: f.taskId });

    const after = await f.t.run(async (ctx) => ctx.db.get(f.taskId));
    expect(after?.reviewTaskSandboxStatus).toBe("closed");
  }, TIMEOUT_MS);

  test("get_agent_state uses the same executing rule as stop and list", () => {
    const nodeActions = convexSource("mcp/nodeActions.ts");
    const getState = nodeActions.slice(
      nodeActions.indexOf("export const orchestratorGetAgentState"),
      nodeActions.indexOf("async function delay"),
    );
    expect(getState).toContain("internal.mcp.queries.entityIsExecuting");
    expect(getState).not.toContain("session.activeWorkflowId !== undefined");
  });

  test("send treats a session /loop turn as busy", () => {
    const nodeActions = convexSource("mcp/nodeActions.ts");
    const send = nodeActions.slice(
      nodeActions.indexOf("export const orchestratorSendMessage"),
      nodeActions.indexOf("export const orchestratorStopAgent"),
    );
    expect(send).toContain("internal.mcp.queries.entityIsExecuting");
    const delivery = nodeActions.slice(
      nodeActions.indexOf("function chatDelivery"),
      nodeActions.indexOf("export const orchestratorSendMessage"),
    );
    expect(delivery).toContain("sessionIsExecuting || queuedAhead > 0");
    expect(delivery).not.toContain("session.activeWorkflowId");
  });

  test("stop refuses to kill a turn that is already running", () => {
    const nodeActions = convexSource("mcp/nodeActions.ts");
    const stop = nodeActions.slice(
      nodeActions.indexOf("export const mcpStopEntitySandbox"),
      nodeActions.indexOf("const queuedMessageSchema"),
    );
    // Asked of the turns table, not of `activeWorkflowId`: a daemon-minted
    // continuation never sets that field, and stopping under one kills it.
    expect(stop).toContain("internal.mcp.queries.entityIsExecuting");
    expect(stop).toContain("stop_agent");
    // The refusal comes before the stop mutation is ever issued.
    expect(stop.indexOf("entityIsExecuting")).toBeLessThan(
      stop.indexOf("surface.stop"),
    );
  });

  test("a session running a daemon continuation counts as executing", async () => {
    const f = await fixture();
    // A `/loop` turn: an open row in `turns`, and no activeWorkflowId at all.
    const loopingSessionId = await f.t.run(async (ctx) => {
      const sessionId = await ctx.db.insert("sessions", {
        repoId: f.repoId,
        userId: f.ownerUserId,
        title: "Looping",
        status: "active",
        numId: 13,
        turnLifecycleVersion: 2,
      });
      await ctx.db.insert("turns", {
        surface: "session",
        entityId: String(sessionId),
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
        activeBuildWorkflowId: "wf_project_build",
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

  test("start waits for active rather than reporting a resuming sandbox", () => {
    const nodeActions = convexSource("mcp/nodeActions.ts");
    const start = nodeActions.slice(
      nodeActions.indexOf("export const mcpStartEntitySandbox"),
      nodeActions.indexOf("export const mcpStopEntitySandbox"),
    );
    expect(start).toContain("ensureEntitySandboxActive");
    expect(start).toContain('sandboxStatus: "active"');
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
    const session = await f.t.run(async (ctx) => ctx.db.get(f.sessionId));
    expect(session?.activeWorkflowId).toBe("wf_session");
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
        .withIndex("by_parent_and_order", (q) =>
          q.eq("parentId", f.sessionId),
        )
        .collect(),
    );
    expect(survivors).toHaveLength(2);
  });

  test("naming neither a message nor all is refused before anything is resolved", () => {
    const entityTools = convexSource("mcp/entityTools.ts");
    const cancel = entityTools.slice(
      entityTools.indexOf('"cancel_queued_message"'),
    );
    const guard = cancel.indexOf("!all && queuedMessageId === undefined");
    const resolve = cancel.indexOf("resolveEntityTarget");
    expect(guard).toBeGreaterThan(-1);
    expect(resolve).toBeGreaterThan(guard);
  });
});

describe("the new tools reach every MCP caller and write no review state", () => {
  const tools = convexSource("mcp/tools.ts");
  const entityTools = convexSource("mcp/entityTools.ts");
  const nodeActions = convexSource("mcp/nodeActions.ts");

  test("they are registered above the orchestrator gate, like send_chat_message", () => {
    const registered = tools.indexOf(
      "registerEntityTools(server, credentials, ctx)",
    );
    const gate = tools.indexOf("if (isOrchestrator) {");
    expect(registered).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(registered);
    for (const name of [
      '"list_entities"',
      '"start_sandbox"',
      '"stop_sandbox"',
      '"cancel_queued_message"',
    ]) {
      expect(entityTools).toContain(name);
    }
  });

  test("every entity tool resolves its target through the shared access check", () => {
    const entityRef = convexSource("mcp/entityRef.ts");
    expect(entityRef).toContain("assertUserRepoAccess(target.repoId");
    // Four tools, four resolutions: three by entity ref, one by repo ref.
    expect(
      (entityTools.match(/resolveEntityTarget\(ref, userId\)/g) ?? []).length,
    ).toBe(3);
    expect(entityTools).toContain("assertUserRepoAccess(ref.repoId, userId)");
  });

  test("no entity tool patches status, phase or any review field", () => {
    // Vedant owns mark-active and status. The MCP surface starts and stops
    // VMs and clears queues; it never moves work across the board.
    for (const forbidden of [
      "update_entity",
      "updateStatus",
      "setPhase",
      "agentTasks:update",
      "projects:update",
      "sessions:updateStatus",
    ]) {
      expect(entityTools).not.toContain(forbidden);
    }
    // The three new actions name exactly two mutations directly — both on the
    // queue — and reach sandbox start/stop only through SANDBOX_SURFACES,
    // whose whole contents are pinned above. Nothing patches a row.
    const newActions = nodeActions.slice(
      nodeActions.indexOf("export const mcpStartEntitySandbox"),
      nodeActions.indexOf("export const orchestratorCreateSession"),
    );
    expect(newActions).toContain("surface.stop");
    expect(newActions).toContain("ensureEntitySandboxActive");
    expect(newActions.match(/"[\w/]+:[\w]+"/g)).toEqual([
      '"queuedMessages:listByParent"',
      '"queuedMessages:remove"',
    ]);
    // The start path issues its mutation via the same shared map.
    const ensure = nodeActions.slice(
      nodeActions.indexOf("async function ensureEntitySandboxActive"),
      nodeActions.indexOf("function chatDelivery"),
    );
    expect(ensure).toContain("surface.start");
    expect(ensure.match(/"[\w/]+:[\w]+"/g)).toBeNull();
  });
});

/**
 * 2026-09-10: a session on eva diagnosed a carepulse-ts PR but could not post
 * the fix into that PR's task chat — every entity tool ran the sandbox token's
 * single-repo pin, while create_and_run_task never did. Chats now follow the
 * per-user rule the web app uses; the pin stays on anything that hands out a
 * repo's credentials.
 */
describe("a sandbox token reaches chats in every repo its user can, but credentials stay pinned", () => {
  const entityRef = readFileSync(
    join(testsDir, "../convex/mcp/entityRef.ts"),
    "utf8",
  );
  const entityToolsSource = readFileSync(
    join(testsDir, "../convex/mcp/entityTools.ts"),
    "utf8",
  );
  const tools = readFileSync(join(testsDir, "../convex/mcp/tools.ts"), "utf8");
  const between = (source: string, start: string, end: string): string =>
    source.slice(source.indexOf(start), source.indexOf(end));

  test("resolving a chat checks the user, not the token pin", () => {
    const resolve = between(
      entityRef,
      "async function resolveEntityTarget(",
      "return {\n    assertRepoAccess,",
    );
    expect(resolve).toContain("assertUserRepoAccess(target.repoId, userId)");
    expect(resolve).not.toContain("assertRepoAccess(");
    expect(entityRef).not.toContain("tokenScopedRepoIds");
  });

  test("the chat tools never import the pinned check", () => {
    expect(entityToolsSource).toContain("assertUserRepoAccess");
    expect(entityToolsSource).not.toMatch(/\bassertRepoAccess\b/);
    expect(entityToolsSource).not.toContain("tokenScopedRepoIds");
  });

  test("the pin still guards every credential hand-out", () => {
    const pinned = between(
      entityRef,
      "async function assertRepoAccess(",
      "async function resolveRepoRef(",
    );
    expect(pinned).toContain("scoped to a different repository");
    // Convex deploy keys, Postgres, and repo skills all go through the pinned check.
    const credentials = between(
      tools,
      "async function resolveTargetWithAccess(",
      '"list_tables"',
    );
    expect(credentials).toContain("await assertRepoAccess(repoId, userId)");
    const postgres = between(
      tools,
      '"postgres_query"',
      "async function resolveRepoByName(",
    );
    expect(postgres).toContain("await assertRepoAccess(ref.repoId, userId)");
  });
});
