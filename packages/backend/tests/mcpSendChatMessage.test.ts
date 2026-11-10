import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { recordPullRequest } from "../convex/_pullRequests/store";
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

/** Loading the chat-workflow module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;

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
    // A task's PR names the run that opened it.
    const runId = await ctx.db.insert("agentRuns", {
      taskId,
      status: "success",
      logs: [],
    });
    await recordPullRequest(ctx, {
      owner: { kind: "task", taskId, runId },
      repoId,
      prUrl: TASK_PR_URL,
      state: "open",
      primary: true,
      origin: "eva",
    });
    const projectId = await ctx.db.insert("projects", {
      repoId,
      userId: ownerUserId,
      title: "Billing revamp",
      phase: "in_progress",
      rawInput: "revamp billing",
      numId: 42,
      branchName: "eva/project-billing",
    });
    await recordPullRequest(ctx, {
      owner: { kind: "session", sessionId },
      repoId,
      prUrl: PR_URL,
      state: "open",
      primary: true,
      origin: "eva",
    });
    await recordPullRequest(ctx, {
      owner: { kind: "project", projectId },
      repoId,
      prUrl: PROJECT_PR_URL,
      state: "open",
      primary: true,
      origin: "eva",
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
  test("any PR a session holds reaches it, not only its main one", async () => {
    const f = await fixture();
    const sidePrUrl = "https://github.com/vvedantb/eva/pull/667";
    await f.t.run(async (ctx) => {
      await recordPullRequest(ctx, {
        owner: { kind: "session", sessionId: f.sessionId },
        repoId: f.repoId,
        prUrl: sidePrUrl,
        state: "open",
        primary: false,
        origin: "agent",
      });
    });
    const resolved = await f.t.query(
      internal.mcp.queries.resolveChatTargetForUser,
      { userId: f.ownerUserId, prUrl: sidePrUrl },
    );
    expect(resolved?.targetId).toBe(f.sessionId);
    // The chat's own PR is still the one it reports.
    expect(resolved?.prUrl).toBe(PR_URL);
  });

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

  test("an idle session chat gets a user message and then a turn", () => {
    // A session send is addressed to one of its chats (resolved upstream by
    // `sessionChats:resolveDeliveryChat`), so both mutations take `chatId`.
    const calls = buildChatMessageCalls({
      kind: "session",
      id: "c1",
      message: "keep going",
      delivery: resolveAgentDelivery({ isBusy: false, storedModel: "opus" }),
      sentViaOrchestrator: false,
    });

    expect(calls.map((call) => call.fn)).toEqual([
      "_sessions/mutations:addMessage",
      "_sessions/execution:startExecute",
    ]);
    expect(calls[0]?.args).toEqual({
      chatId: "c1",
      role: "user",
      content: "keep going",
      model: "claude:opus",
      sentViaOrchestrator: false,
    });
    expect(calls[1]?.args).toEqual({
      chatId: "c1",
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

describe("user-MCP watch resolves the live Manager Ave thread", () => {
  test("the owner’s live thread is returned, a stranger’s is not", async () => {
    const f = await fixture();
    const threadId = await f.t.run(async (ctx) =>
      ctx.db.insert("aveThreads", {
        userId: f.ownerUserId,
        status: "idle",
        updatedAt: 1,
      }),
    );
    expect(
      await f.t.query(internal._ave.threads.getLiveThreadIdForUser, {
        userId: f.ownerUserId,
      }),
    ).toBe(threadId);
    expect(
      await f.t.query(internal._ave.threads.getLiveThreadIdForUser, {
        userId: f.strangerUserId,
      }),
    ).toBeNull();
  });

  test("a reset (archived) thread is not live", async () => {
    const f = await fixture();
    await f.t.run(async (ctx) => {
      await ctx.db.insert("aveThreads", {
        userId: f.ownerUserId,
        status: "idle",
        archivedAt: 1,
        updatedAt: 1,
      });
    });
    expect(
      await f.t.query(internal._ave.threads.getLiveThreadIdForUser, {
        userId: f.ownerUserId,
      }),
    ).toBeNull();
  });

  test("a malformed user id is rejected rather than guessed at", async () => {
    const f = await fixture();
    expect(
      await f.t.query(internal._ave.threads.getLiveThreadIdForUser, {
        userId: "not-an-id",
      }),
    ).toBeNull();
  });
});

describe("MCP follow-up on a completed/closed-sandbox quick task", () => {
  test(
    "markTaskSandboxStartingForChat flips closed to starting so ready is accepted",
    async () => {
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
    },
    TIMEOUT_MS,
  );

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

describe("user MCP accepts fable on per-turn sends and runs it as Eva's Fable model", () => {
  const schema = z.enum(MCP_CLAUDE_MODELS);

  test("the shared MCP model enum accepts fable and rejects grok", () => {
    expect([...MCP_CLAUDE_MODELS]).toEqual([
      "opus",
      "sonnet",
      "haiku",
      "fable",
    ]);
    expect(schema.parse("fable")).toBe("fable");
    expect(schema.safeParse("grok").success).toBe(false);
    expect(schema.safeParse("cursor:grok-4.6").success).toBe(false);
    expect(schema.safeParse("claude:claude-fable-5").success).toBe(false);
  });

  test("send_chat_message canonicalizes fable", () => {
    expect(normalizeAIModel("fable")).toBe("claude:claude-fable-5-2");
    expect(
      resolveAgentDelivery({
        isBusy: false,
        requestedModel: "fable",
        storedModel: "cursor:grok-4.6",
      }).model,
    ).toBe("claude:claude-fable-5-2");
  });
});
