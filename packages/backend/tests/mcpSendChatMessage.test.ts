import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { canonicalPrUrl } from "../convex/mcp/sessionRef";
import { MCP_CLAUDE_MODELS } from "../convex/mcp/toolShared";
import {
  buildChatMessageCalls,
  resolveAgentDelivery,
  type ChatTargetKind,
} from "../convex/mcp/orchestratorDelivery";
import { normalizeAIModel } from "../convex/_validators/aiModels";
import { z } from "zod";

const modules = import.meta.glob("../convex/**/*.ts");
const testsDir = dirname(fileURLToPath(import.meta.url));

/** Loading the chat-workflow module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;

function convexSource(path: string): string {
  return readFileSync(join(testsDir, "../convex", path), "utf8");
}

const PR_URL = "https://github.com/vvedantb/eva/pull/664";
const TASK_PR_URL = "https://github.com/vvedantb/eva/pull/665";
const PROJECT_PR_URL = "https://github.com/vvedantb/eva/pull/666";

/**
 * Owner with one of each chat surface — session, quick task (with the run that
 * opened its PR) and project — plus an unrelated user who owns nothing here.
 * Every surface takes numId 42 so the ambiguity a bare number carries is real.
 */
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const ownerUserId = await ctx.db.insert("users", {});
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
      numId: 42,
      prUrl: PR_URL,
      branchName: "eva/session-login",
    });
    const strangerSessionId = await ctx.db.insert("sessions", {
      repoId: otherRepoId,
      userId: strangerUserId,
      title: "Not yours",
      status: "active",
      numId: 7,
    });
    const taskId = await ctx.db.insert("agentTasks", {
      repoId,
      title: "Bump the deps",
      status: "code_review",
      numId: 42,
      createdAt: now,
      updatedAt: now,
      createdBy: ownerUserId,
    });
    // A task's PR lives on the run that opened it, not on the task row.
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
      numId: 42,
      prUrl: PROJECT_PR_URL,
      branchName: "eva/project-billing",
    });
    return {
      ownerUserId,
      strangerUserId,
      repoId,
      otherRepoId,
      sessionId,
      strangerSessionId,
      taskId,
      projectId,
    };
  });
  return { t, ...ids };
}

describe("resolving the chat an MCP caller named", () => {
  test("the owner reaches their session by Convex id, PR url, and numId", async () => {
    const f = await fixture();

    for (const ref of [
      { id: f.sessionId },
      { prUrl: PR_URL },
      { numId: 42, kind: "session" as const, repoId: f.repoId },
    ]) {
      const resolved = await f.t.query(
        internal.mcp.queries.resolveChatTargetForUser,
        { userId: f.ownerUserId, ...ref },
      );
      expect(resolved?.kind).toBe("session");
      expect(resolved?.targetId).toBe(f.sessionId);
      expect(resolved?.repoOwner).toBe("vvedantb");
      expect(resolved?.numId).toBe(42);
      expect(resolved?.prUrl).toBe(PR_URL);
    }
  });

  test("a quick task's chat is reachable by id, its run's PR url, and numId", async () => {
    const f = await fixture();

    for (const ref of [
      { id: f.taskId },
      { prUrl: TASK_PR_URL },
      { numId: 42, kind: "task" as const, repoId: f.repoId },
    ]) {
      const resolved = await f.t.query(
        internal.mcp.queries.resolveChatTargetForUser,
        { userId: f.ownerUserId, ...ref },
      );
      expect(resolved?.kind).toBe("task");
      expect(resolved?.targetId).toBe(f.taskId);
      expect(resolved?.title).toBe("Bump the deps");
    }
  });

  test("a project's chat is reachable by id, PR url, and numId", async () => {
    const f = await fixture();

    for (const ref of [
      { id: f.projectId },
      { prUrl: PROJECT_PR_URL },
      { numId: 42, kind: "project" as const, repoId: f.repoId },
    ]) {
      const resolved = await f.t.query(
        internal.mcp.queries.resolveChatTargetForUser,
        { userId: f.ownerUserId, ...ref },
      );
      expect(resolved?.kind).toBe("project");
      expect(resolved?.targetId).toBe(f.projectId);
      // A project tracks a phase where a session tracks a status.
      expect(resolved?.status).toBe("in_progress");
    }
  });

  test("kind picks between the three rows that all number themselves 42", async () => {
    const f = await fixture();
    const byKind = await Promise.all(
      (["session", "task", "project"] as const).map((kind) =>
        f.t.query(internal.mcp.queries.resolveChatTargetForUser, {
          userId: f.ownerUserId,
          numId: 42,
          kind,
          repoId: f.repoId,
        }),
      ),
    );
    expect(byKind.map((hit) => hit?.targetId)).toEqual([
      f.sessionId,
      f.taskId,
      f.projectId,
    ]);
  });

  test("a Convex id is never mistaken for another table's row", async () => {
    const f = await fixture();
    // The id belongs to a task, so a session-only search must miss rather than
    // fall through to the task.
    expect(
      await f.t.query(internal.mcp.queries.resolveChatTargetForUser, {
        userId: f.ownerUserId,
        id: f.taskId,
        kind: "session",
      }),
    ).toBeNull();
  });

  test("a task with no repo of its own inherits its project's access", async () => {
    const f = await fixture();
    const projectTaskId = await f.t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("agentTasks", {
        projectId: f.projectId,
        title: "Project child task",
        status: "todo",
        numId: 43,
        createdAt: now,
        updatedAt: now,
        createdBy: f.ownerUserId,
      });
    });

    const resolved = await f.t.query(
      internal.mcp.queries.resolveChatTargetForUser,
      { userId: f.ownerUserId, id: projectTaskId },
    );
    expect(resolved?.targetId).toBe(projectTaskId);
    expect(resolved?.repoId).toBe(f.repoId);
  });

  test("a chat in a repo the caller cannot reach resolves to nothing", async () => {
    const f = await fixture();
    // Named exactly right — the only thing missing is access, and the answer is
    // the same null a bogus id gets, so no session is confirmed to exist.
    const resolved = await f.t.query(
      internal.mcp.queries.resolveChatTargetForUser,
      { userId: f.ownerUserId, id: f.strangerSessionId },
    );
    expect(resolved).toBeNull();
  });

  test("a numId is not enough on its own, and belongs to its own repo only", async () => {
    const f = await fixture();
    // No kind: 42 names a session, a task and a project at once.
    expect(
      await f.t.query(internal.mcp.queries.resolveChatTargetForUser, {
        userId: f.ownerUserId,
        numId: 42,
        repoId: f.repoId,
      }),
    ).toBeNull();
    expect(
      await f.t.query(internal.mcp.queries.resolveChatTargetForUser, {
        userId: f.ownerUserId,
        numId: 42,
        kind: "session",
      }),
    ).toBeNull();
    expect(
      await f.t.query(internal.mcp.queries.resolveChatTargetForUser, {
        userId: f.ownerUserId,
        numId: 42,
        kind: "session",
        repoId: f.otherRepoId,
      }),
    ).toBeNull();
  });

  test("an unknown reference and a soft-deleted chat both resolve to nothing", async () => {
    const f = await fixture();
    expect(
      await f.t.query(internal.mcp.queries.resolveChatTargetForUser, {
        userId: f.ownerUserId,
        id: "not-an-id",
      }),
    ).toBeNull();
    expect(
      await f.t.query(internal.mcp.queries.resolveChatTargetForUser, {
        userId: f.ownerUserId,
        prUrl: "https://github.com/vvedantb/eva/pull/999",
      }),
    ).toBeNull();

    await f.t.run(async (ctx) => {
      const deletedAt = Date.now();
      await ctx.db.patch(f.sessionId, { deletedAt });
      await ctx.db.patch(f.taskId, { deletedAt });
      await ctx.db.patch(f.projectId, { deletedAt });
    });
    for (const id of [f.sessionId, f.taskId, f.projectId]) {
      expect(
        await f.t.query(internal.mcp.queries.resolveChatTargetForUser, {
          userId: f.ownerUserId,
          id,
        }),
      ).toBeNull();
    }
  });

  test("a teammate on the repo's team reaches the chat too", async () => {
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

    const resolved = await f.t.query(
      internal.mcp.queries.resolveChatTargetForUser,
      { userId: teammateUserId, prUrl: PR_URL },
    );
    expect(resolved?.targetId).toBe(f.sessionId);
  });
});

describe("PR links the tool accepts", () => {
  test("review tails, query strings, and anchors all canonicalise", () => {
    for (const input of [
      PR_URL,
      `${PR_URL}/`,
      `${PR_URL}/files`,
      `${PR_URL}/commits/abc123`,
      `${PR_URL}?diff=split`,
      `${PR_URL}#issuecomment-1`,
      "github.com/vvedantb/eva/pull/664",
      "http://www.github.com/vvedantb/eva/pull/664",
      "  https://github.com/vvedantb/eva/pull/664  ",
    ]) {
      expect(canonicalPrUrl(input)).toBe(PR_URL);
    }
  });

  test("anything that is not a PR link is rejected rather than guessed at", () => {
    for (const input of [
      "https://github.com/vvedantb/eva",
      "https://github.com/vvedantb/eva/issues/664",
      "https://gitlab.com/vvedantb/eva/pull/664",
      "664",
      "",
    ]) {
      expect(canonicalPrUrl(input)).toBeNull();
    }
  });
});

describe("what a send does to the chat", () => {
  const KINDS: ChatTargetKind[] = ["session", "task", "project"];

  test("an idle session gets a user message and then a turn", () => {
    const calls = buildChatMessageCalls({
      kind: "session",
      id: "s1",
      message: "keep going",
      delivery: resolveAgentDelivery({ isBusy: false, storedModel: "opus" }),
      sentViaOrchestrator: false,
    });

    expect(calls.map((call) => call.fn)).toEqual([
      "_sessions/mutations:addMessage",
      "_sessions/execution:startExecute",
    ]);
    expect(calls[0]?.args).toEqual({
      id: "s1",
      role: "user",
      content: "keep going",
      model: "claude:opus",
      sentViaOrchestrator: false,
    });
    expect(calls[1]?.args).toEqual({
      sessionId: "s1",
      message: "keep going",
      model: "claude:opus",
    });
  });

  test("an idle quick task chat runs on the task's own chat workflow", () => {
    const calls = buildChatMessageCalls({
      kind: "task",
      id: "t1",
      message: "keep going",
      delivery: resolveAgentDelivery({ isBusy: false, storedModel: "sonnet" }),
      sentViaOrchestrator: false,
    });

    expect(calls.map((call) => call.fn)).toEqual([
      "agentTaskChatWorkflow:addMessage",
      "agentTaskChatWorkflow:startExecute",
    ]);
    expect(calls[0]?.args.taskId).toBe("t1");
    expect(calls[1]?.args).toEqual({
      taskId: "t1",
      message: "keep going",
      model: "claude:sonnet",
    });
  });

  test("an idle project chat runs on the project's own chat workflow", () => {
    const calls = buildChatMessageCalls({
      kind: "project",
      id: "p1",
      message: "keep going",
      delivery: resolveAgentDelivery({ isBusy: false, storedModel: "opus" }),
      sentViaOrchestrator: false,
    });

    expect(calls.map((call) => call.fn)).toEqual([
      "projectChatWorkflow:addMessage",
      "projectChatWorkflow:startExecute",
    ]);
    expect(calls[0]?.args.projectId).toBe("p1");
  });

  test("a busy chat queues one message instead of starting a second turn", () => {
    for (const kind of KINDS) {
      const calls = buildChatMessageCalls({
        kind,
        id: "x1",
        message: "and this next",
        delivery: resolveAgentDelivery({ isBusy: true }),
        sentViaOrchestrator: true,
      });

      expect(calls).toHaveLength(1);
      expect(calls[0]?.fn).toContain("enqueueMessage");
      expect(Object.values(calls[0]?.args ?? {})).toContain("x1");
    }
  });

  test("the via-master badge only goes where a validator declares it", () => {
    // Convex rejects an argument no validator declares. Project chat has no
    // `sentViaOrchestrator` — the master session cannot drive a project — so
    // passing one there would fail the send outright.
    for (const kind of KINDS) {
      const args = [false, true].flatMap((isBusy) =>
        buildChatMessageCalls({
          kind,
          id: "x1",
          message: "hi",
          delivery: resolveAgentDelivery({ isBusy }),
          sentViaOrchestrator: true,
        }).flatMap((call) => Object.keys(call.args)),
      );
      expect(args.includes("sentViaOrchestrator")).toBe(kind !== "project");
    }
  });

  test("no send path creates a task, session or project", () => {
    const everyCall = KINDS.flatMap((kind) =>
      [false, true].flatMap((isBusy) =>
        buildChatMessageCalls({
          kind,
          id: "x1",
          message: "hi",
          delivery: resolveAgentDelivery({ isBusy }),
          sentViaOrchestrator: false,
        }),
      ),
    );
    for (const call of everyCall) {
      expect(call.fn).not.toContain("create");
      // Only the three chat surfaces' own modules are ever called.
      expect(
        /^(_sessions\/|agentTaskChatWorkflow:|projectChatWorkflow:)/.test(
          call.fn,
        ),
      ).toBe(true);
    }
  });

  test("no argument is sent that the chat mutations do not declare", () => {
    // Sessions lost their plan/edit `mode` long ago, but the MCP send kept
    // passing one. Convex rejects an argument no validator declares, so that
    // leftover failed the whole send.
    const args = KINDS.flatMap((kind) =>
      [false, true].flatMap((isBusy) =>
        buildChatMessageCalls({
          kind,
          id: "x1",
          message: "hi",
          delivery: resolveAgentDelivery({ isBusy }),
          sentViaOrchestrator: false,
        }).flatMap((call) => Object.keys(call.args)),
      ),
    );
    expect(args).not.toContain("mode");
  });
});

describe("which tokens get which tools", () => {
  const tools = convexSource("mcp/tools.ts");
  const orchestratorTools = convexSource("mcp/orchestratorTools.ts");

  test("send_chat_message is registered for every MCP caller", () => {
    // Registered in tools.ts, above the isOrchestrator gate at the bottom —
    // that ordering is what puts it on a plain OAuth connector's tool list.
    const registered = tools.indexOf('"send_chat_message"');
    const gate = tools.indexOf("if (isOrchestrator) {");
    expect(registered).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(registered);
    expect(orchestratorTools).not.toContain('"send_chat_message"');
  });

  test("send_chat_message stamps the via-MCP badge for every caller", () => {
    const start = tools.indexOf('"send_chat_message"');
    const body = tools.slice(start, tools.indexOf('"create_eva_doc"'));
    expect(body).toContain("sentViaOrchestrator: true");
    expect(body).not.toContain(
      "sentViaOrchestrator: masterSessionId !== undefined",
    );
  });

  test("fleet tools are registered for every MCP caller", () => {
    // registerFleetTools is called in tools.ts above the isOrchestrator gate,
    // the same ordering that puts send_chat_message on an OAuth connector.
    const fleet = tools.indexOf("registerFleetTools(server, credentials, ctx)");
    const gate = tools.indexOf("if (isOrchestrator) {");
    expect(fleet).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(fleet);
    for (const name of [
      '"list_agents"',
      '"get_agent_state"',
      '"stop_agent"',
      '"create_session"',
      '"watch_agent"',
      '"unwatch_agent"',
    ]) {
      expect(orchestratorTools).toContain(name);
    }
  });

  test("send_agent_message stays behind the orchestrator gate", () => {
    expect(orchestratorTools).toContain('"send_agent_message"');
    expect(tools).not.toContain('"send_agent_message"');
    const registerAt = tools.indexOf("registerOrchestratorTools(server");
    const guardAt = tools.lastIndexOf("if (isOrchestrator) {", registerAt);
    expect(registerAt).toBeGreaterThan(-1);
    expect(guardAt).toBeGreaterThan(-1);
    expect(tools.slice(guardAt, registerAt)).not.toContain("}");
    expect(tools).toContain(
      "if (isOrchestrator) {\n    registerOrchestratorTools(server, credentials, ctx);",
    );
  });

  test("watch_agent does not require the master sandbox token", () => {
    expect(orchestratorTools).not.toContain(
      "Watch tools require the master session's own sandbox token.",
    );
    expect(orchestratorTools).toContain(
      "getLiveOrchestratorSessionIdForUser",
    );
  });

  test("the send checks repo access before it sends", () => {
    const start = tools.indexOf('"send_chat_message"');
    const body = tools.slice(start, tools.indexOf('"create_eva_doc"'));
    // Resolution and the access check moved into the shared entityRef leaf so
    // every tool that acts on an existing chat runs the same two checks.
    const resolve = body.indexOf("resolveEntityTarget(ref, userId)");
    const send = body.indexOf("orchestratorSendMessage");
    expect(resolve).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(resolve);

    const entityRef = convexSource("mcp/entityRef.ts");
    const target = entityRef.indexOf("resolveChatTargetForUser");
    // The per-user check (not the sandbox token's repo pin — chats are
    // reachable across every repo the user can open in Eva).
    const check = entityRef.indexOf("assertUserRepoAccess(target.repoId");
    expect(check).toBeGreaterThan(target);
  });

  test("get_agent_state refuses ids the caller cannot reach", () => {
    const nodeActions = convexSource("mcp/nodeActions.ts");
    const getState = nodeActions.slice(
      nodeActions.indexOf("export const orchestratorGetAgentState"),
      nodeActions.indexOf("export const orchestratorSendMessage"),
    );
    expect(getState).toContain(
      "No ${kind} ${id} found, or you do not have access.",
    );
    expect(getState).toContain('"_sessions/queries:get"');
    expect(getState).toContain('"_agentTasks/queries:get"');
  });
});

describe("user-MCP watch resolves Manager Ave without a master token", () => {
  test("the owner’s live Ave session is returned, a stranger’s is not", async () => {
    const f = await fixture();
    const aveId = await f.t.run(async (ctx) => {
      const sessionId = await ctx.db.insert("sessions", {
        repoId: f.repoId,
        userId: f.ownerUserId,
        title: "Manager Ave",
        status: "active",
        numId: 1,
        isOrchestrator: true,
      });
      await ctx.db.patch(f.ownerUserId, { orchestratorSessionId: sessionId });
      return sessionId;
    });

    expect(
      await f.t.query(
        internal.mcp.queries.getLiveOrchestratorSessionIdForUser,
        { userId: f.ownerUserId },
      ),
    ).toBe(aveId);
    expect(
      await f.t.query(
        internal.mcp.queries.getLiveOrchestratorSessionIdForUser,
        { userId: f.strangerUserId },
      ),
    ).toBeNull();
  });

  test("an archived or unflagged session is not a live master", async () => {
    const f = await fixture();
    await f.t.run(async (ctx) => {
      const sessionId = await ctx.db.insert("sessions", {
        repoId: f.repoId,
        userId: f.ownerUserId,
        title: "Manager Ave",
        status: "active",
        numId: 1,
        isOrchestrator: true,
        archived: true,
      });
      await ctx.db.patch(f.ownerUserId, { orchestratorSessionId: sessionId });
    });
    expect(
      await f.t.query(
        internal.mcp.queries.getLiveOrchestratorSessionIdForUser,
        { userId: f.ownerUserId },
      ),
    ).toBeNull();
  });

  test("a missing user id is rejected rather than guessed at", async () => {
    const f = await fixture();
    expect(
      await f.t.query(
        internal.mcp.queries.getLiveOrchestratorSessionIdForUser,
        { userId: "not-an-id" },
      ),
    ).toBeNull();
  });
});

describe("MCP follow-up on a completed/closed-sandbox quick task", () => {
  const nodeActions = convexSource("mcp/nodeActions.ts");
  const taskChat = convexSource("agentTaskChatWorkflow.ts");

  test("send_chat_message starts the preview sandbox and waits until it is active", () => {
    const send = nodeActions.slice(
      nodeActions.indexOf("export const orchestratorSendMessage"),
      nodeActions.indexOf("export const orchestratorStopAgent"),
    );
    expect(send).toContain("kind === \"task\"");
    expect(send).toContain("ensureEntitySandboxActive");
    expect(send.indexOf("ensureEntitySandboxActive")).toBeLessThan(
      send.indexOf("buildChatMessageCalls"),
    );

    const ensure = nodeActions.slice(
      nodeActions.indexOf("async function ensureEntitySandboxActive"),
      nodeActions.indexOf("function chatDelivery"),
    );
    expect(ensure).toContain("SANDBOX_SURFACES[kind]");
    expect(ensure).toContain("decideSandboxStartPlan");
    expect(ensure).toContain("TASK_PREVIEW_SANDBOX_READY_TIMEOUT_MS");
    // The Start-button mutation, not an in-place resume of the closed id.
    expect(convexSource("mcp/orchestratorDelivery.ts")).toContain(
      "agentTasks:startTaskSandbox",
    );
  });

  test("turn staging does not prewarm a closed or stopping preview sandbox", () => {
    // The guard sits with the prewarm, in the helper both startExecute and
    // retryLastTurnWithAccount stage their turn through.
    const staging = taskChat.slice(
      taskChat.indexOf("async function stageAndStartTaskChatTurn"),
      taskChat.indexOf("export const agentTaskChatCompleteEvent"),
    );
    expect(staging).toContain(
      'task.reviewTaskSandboxStatus !== "closed"',
    );
    expect(staging).toContain(
      'task.reviewTaskSandboxStatus !== "stopping"',
    );
  });

  test("the chat workflow starts a closed sandbox instead of resuming it in place", () => {
    const workflow = taskChat.slice(
      taskChat.indexOf("export const agentTaskChatExecuteWorkflow"),
      taskChat.indexOf("export const addAssistantPlaceholder"),
    );
    expect(workflow).toContain("decideSandboxStartPlan");
    expect(workflow).toContain("markTaskSandboxStartingForChat");
    expect(workflow).toContain("startTaskPreviewSandbox");
    expect(workflow).toContain("waitForTaskPreviewSandboxActive");
    expect(workflow).toContain("sandboxRunning: data.sandboxStatus === \"active\"");
    expect(workflow).not.toContain("sandboxRunning: false");
  });

  test("markTaskSandboxStartingForChat flips closed to starting so ready is accepted", async () => {
    const f = await fixture();
    const now = Date.now();
    const taskId = await f.t.run(async (ctx) => {
      return await ctx.db.insert("agentTasks", {
        repoId: f.repoId,
        title: "Closed sandbox follow-up",
        status: "business_review",
        numId: 470,
        createdAt: now,
        updatedAt: now,
        createdBy: f.ownerUserId,
        sandboxId: "sbx_closed",
        reviewTaskSandboxStatus: "closed",
      });
    });

    await f.t.mutation(
      internal.agentTaskChatWorkflow.markTaskSandboxStartingForChat,
      { taskId },
    );

    const after = await f.t.run(async (ctx) => ctx.db.get(taskId));
    expect(after?.reviewTaskSandboxStatus).toBe("starting");

    const activity = await f.t.run(async (ctx) =>
      ctx.db
        .query("streamingActivity")
        .withIndex("by_entity", (q) =>
          q.eq("entityId", `task-sandbox-startup-${taskId}`),
        )
        .first(),
    );
    expect(activity?.currentActivity).toContain("Starting sandbox...");
  }, TIMEOUT_MS);

  test("waitForTaskPreviewSandboxActive is ready only when status is active", async () => {
    const f = await fixture();
    const now = Date.now();
    const { closedId, activeId } = await f.t.run(async (ctx) => {
      const closedId = await ctx.db.insert("agentTasks", {
        repoId: f.repoId,
        title: "Closed",
        status: "business_review",
        numId: 471,
        createdAt: now,
        updatedAt: now,
        createdBy: f.ownerUserId,
        reviewTaskSandboxStatus: "closed",
      });
      const activeId = await ctx.db.insert("agentTasks", {
        repoId: f.repoId,
        title: "Active",
        status: "business_review",
        numId: 472,
        createdAt: now,
        updatedAt: now,
        createdBy: f.ownerUserId,
        reviewTaskSandboxStatus: "active",
      });
      return { closedId, activeId };
    });

    expect(
      await f.t.action(
        internal._agentTasks.sandbox.waitForTaskPreviewSandboxActive,
        { taskId: closedId, timeoutMs: 1 },
      ),
    ).toEqual({ ready: false });
    expect(
      await f.t.action(
        internal._agentTasks.sandbox.waitForTaskPreviewSandboxActive,
        { taskId: activeId, timeoutMs: 1 },
      ),
    ).toEqual({ ready: true });
  });
});

describe("MCP sends are badged; composer-typed messages are not", () => {
  const chatMessage = readFileSync(
    join(testsDir, "../../../apps/web/src/lib/components/chat/ChatMessage.tsx"),
    "utf8",
  );
  const sessionSend = readFileSync(
    join(
      testsDir,
      "../../../apps/web/src/routes/_repo/$owner/$repo/sessions/_components/useSessionSend.ts",
    ),
    "utf8",
  );
  const taskSend = readFileSync(
    join(
      testsDir,
      "../../../apps/web/src/lib/components/tasks/TaskSandboxChatPanel.tsx",
    ),
    "utf8",
  );

  test("session chat chrome shows a via-MCP badge on stamped user rows", () => {
    expect(chatMessage).toContain("sentViaOrchestrator === true");
    expect(chatMessage).toContain('"via MCP"');
    expect(chatMessage).not.toContain('"via Ave"');
  });

  test("the session and task composers never stamp the badge", () => {
    expect(sessionSend).not.toContain("sentViaOrchestrator");
    expect(taskSend).not.toContain("sentViaOrchestrator");
  });
});

describe("user MCP accepts fable on per-turn sends and runs it as Eva's Fable model", () => {
  const tools = convexSource("mcp/tools.ts");
  const orchestratorTools = convexSource("mcp/orchestratorTools.ts");
  const schema = z.enum(MCP_CLAUDE_MODELS);

  test("the shared MCP model enum accepts fable and rejects grok", () => {
    expect([...MCP_CLAUDE_MODELS]).toEqual(["opus", "sonnet", "haiku", "fable"]);
    expect(schema.parse("fable")).toBe("fable");
    expect(schema.safeParse("grok").success).toBe(false);
    expect(schema.safeParse("cursor:grok-4.6").success).toBe(false);
    expect(schema.safeParse("claude:claude-fable-5").success).toBe(false);
  });

  test("only the per-turn send tools carry a model picker, and they use that enum", () => {
    expect(tools).not.toContain('.enum(["opus", "sonnet", "haiku"])');
    expect(orchestratorTools).not.toContain('.enum(["opus", "sonnet", "haiku"])');
    // send_chat_message
    expect((tools.match(/enum\(MCP_CLAUDE_MODELS\)/g) ?? []).length).toBe(1);
    // modelArg, shared by send_agent_message
    expect((orchestratorTools.match(/enum\(MCP_CLAUDE_MODELS\)/g) ?? []).length).toBe(
      1,
    );
  });

  test("send_chat_message canonicalizes fable", () => {
    expect(normalizeAIModel("fable")).toBe("claude:claude-fable-5-1");
    expect(
      resolveAgentDelivery({
        isBusy: false,
        requestedModel: "fable",
        storedModel: "cursor:grok-4.6",
      }).model,
    ).toBe("claude:claude-fable-5-1");
  });
});

/**
 * 2026-09-10: carepulse-ts runs cursor:grok-4.6 by default, and every task
 * created through the MCP arrived as Claude because the tool offered a
 * Claude-only `model` enum that agents filled in. `create_session` was worse:
 * it always sent `normalizeAIModel(undefined)` (claude:sonnet), so the repo
 * default never applied even when the caller omitted the model. Creation now
 * takes no model at all; the mutations resolve `repo.defaultModel`.
 */
describe("MCP task and session creation always run on the repo default model", () => {
  const tools = convexSource("mcp/tools.ts");
  const orchestratorTools = convexSource("mcp/orchestratorTools.ts");
  const nodeActions = convexSource("mcp/nodeActions.ts");

  // Code only: the comments explaining the absence of a model mention it.
  const between = (source: string, start: string, end: string): string =>
    source
      .slice(source.indexOf(start), source.indexOf(end))
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");

  test("the task tools expose no model argument", () => {
    const taskArgs = between(tools, "const taskArgs = {", "type TaskInput = {");
    const batch = between(tools, '"create_tasks_batch"', '"send_chat_message"');
    expect(taskArgs).not.toMatch(/\bmodel\b/);
    expect(batch).not.toMatch(/\bmodel\b/);
    expect(between(tools, "type TaskInput = {", "async function createTaskForRepo")).not.toMatch(
      /\bmodel\b/,
    );
  });

  test("create_session exposes no model argument", () => {
    const createSession = between(
      orchestratorTools,
      '"create_session"',
      '"watch_agent"',
    );
    expect(createSession).not.toMatch(/\bmodel\b/);
  });

  test("the backing actions never send a model to the create mutations", () => {
    const createTask = between(
      nodeActions,
      "export const createTask",
      "export const startTaskExecution",
    );
    const createBatch = between(
      nodeActions,
      "export const createTasksBatch",
      "export const createEvaDoc",
    );
    const createSession = between(
      nodeActions,
      "export const orchestratorCreateSession",
      "export const orchestratorSetWatch",
    );
    for (const action of [createTask, createBatch, createSession]) {
      expect(action).not.toMatch(/\bmodel:/);
      expect(action).not.toContain("mutationArgs.model");
      expect(action).not.toContain("normalizeAIModel(");
    }
    expect(nodeActions).not.toContain("mcpClaudeModelValidator");
  });

  test("createSession queues the resolved repo default, not args.model", () => {
    // Prod (2026-09-11): sessions:create Uncaught "model is required when
    // queuing a message" — MCP create_session always sends a message and never
    // a model, so checking args.model rolled the mutation back.
    const source = convexSource("_sessions/mutations.ts");
    const createFn = source.slice(
      source.indexOf("export async function createSession"),
      source.indexOf("export const create ="),
    );
    expect(createFn).toContain("const model = args.model ?? repo.defaultModel");
    expect(createFn).toContain("if (!model)");
    expect(createFn).not.toContain("if (!args.model)");
    expect(createFn).not.toContain("model: args.model");
  });
});

