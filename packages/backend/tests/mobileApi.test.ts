import { convexTest } from "convex-test";
import workflow from "@convex-dev/workflow/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import type { FunctionArgs } from "convex/server";
import type { Id } from "../convex/_generated/dataModel";
import { DEFAULT_AI_MODEL, normalizeAIModel } from "../convex/_validators/aiModels";
import { messageLinkHref } from "@eva/shared/messageLink";
import {
  mentionTokensToChipLinks,
  parseMentionChipHref,
  sessionMenuActions,
  systemSkillTokenId,
  tokenizeMentionText,
  QUICK_TASK_LIST_DEFAULTS,
  applyQuickTaskFilters,
  groupByTaskStatus,
  runAllPlan,
  startAll,
  visibleDrafts,
} from "@eva/shared";
import { MENTION_TOKEN_REGEX } from "../convex/_mentions/mentionToken";
import { SKILL_TOKEN_REGEX } from "../convex/_mentions/skillToken";
import { openTurn } from "../convex/_chat/turnStore";

/**
 * The mobile app's writes (apps/mobile): replies in every chat kind, Stop and
 * new sessions, each through the web's own server paths. Fake timers keep the
 * scheduled sandbox and push actions queued instead of running.
 */

const modules = import.meta.glob("../convex/**/*.ts");
/** Loading the chat-workflow module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|mobile-api";

async function fixture() {
  const t = convexTest(schema, modules);
  workflow.register(t);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID, fullName: "Ada Lovelace" });
    const strangerId = await ctx.db.insert("users", {});
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const strangerRepoId = await ctx.db.insert("githubRepos", {
      owner: "someone",
      name: "else",
      installationId: 2,
      connectedBy: strangerId,
    });
    const sessionId = await ctx.db.insert("sessions", {
      owner: { kind: "standalone" },
      repoId,
      userId,
      title: "Fix the login bug",
      status: "active",
      numId: 42,
    });
    const chatId = await ctx.db.insert("sessionChats", {
      sessionId,
      repoId,
      userId,
      title: "Main",
      number: 1,
      isMain: true,
      lastModel: "codex:gpt-5.6-sol",
    });
    const archivedChatId = await ctx.db.insert("sessionChats", {
      sessionId,
      repoId,
      userId,
      title: "Side",
      number: 2,
      isMain: false,
      archived: true,
    });
    const taskId = await ctx.db.insert("agentTasks", {
      repoId,
      title: "Bump the deps",
      status: "code_review",
      numId: 7,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      // The run's model; the task's session chat starts from it.
      model: "claude:opus",
    });
    const projectId = await ctx.db.insert("projects", {
      repoId,
      userId,
      title: "Billing revamp",
      phase: "in_progress",
      rawInput: "revamp billing",
      numId: 3,
    });
    const strangerTaskId = await ctx.db.insert("agentTasks", {
      repoId: strangerRepoId,
      title: "Not yours",
      status: "todo",
      createdAt: now,
      updatedAt: now,
      createdBy: strangerId,
    });
    return { userId, repoId, sessionId, chatId, archivedChatId, taskId, projectId, strangerTaskId };
  });
  return { t, ids, asUser: t.withIdentity({ subject: CLERK_ID }) };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

/** The session chat a quick task or a project chats in. */
async function ownedChatId(asUser: Fixture["asUser"], owner: FunctionArgs<typeof api.sessions.getOwned>["owner"]) {
  const owned = (await asUser.query(api.sessions.getOwned, { owner }))?.session;
  if (!owned) throw new Error("The owner has no session");
  return owned.chatId;
}

/** User rows and still-queued rows on one chat: a send lands in one of them. */
async function sent(t: Fixture["t"], parentId: Id<"sessionChats"> | Id<"agentTasks"> | Id<"projects">) {
  return await t.run(async (ctx) => {
    const queued = await ctx.db
      .query("queuedMessages")
      .withIndex("by_parent_and_order", (q) => q.eq("parentId", parentId))
      .collect();
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", parentId))
      .collect();
    return [
      ...queued.map((row) => ({ content: row.content, model: row.model, userId: row.userId })),
      ...messages
        .filter((row) => row.role === "user")
        .map((row) => ({ content: row.content, model: row.model, userId: row.userId })),
    ];
  });
}

describe("mobile api", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test(
    "getChat lets the app reply in session, task and project chats",
    async () => {
      const { ids, asUser } = await fixture();
      const session = await asUser.query(api.mobile.getChat, { target: ids.sessionId });
      const task = await asUser.query(api.mobile.getChat, { target: ids.taskId });
      const project = await asUser.query(api.mobile.getChat, { target: ids.projectId });
      const archived = await asUser.query(api.mobile.getChat, { target: ids.archivedChatId });
      expect(session).toMatchObject({ kind: "session", canReply: true, model: "codex:gpt-5.6-sol" });
      expect(task).toMatchObject({ kind: "task", canReply: true, model: "claude:opus" });
      expect(project).toMatchObject({ kind: "project", canReply: true, webPath: "/vvedantb/eva/projects/3" });
      expect(archived).toMatchObject({ canReply: false });
    },
    TIMEOUT_MS,
  );

  test(
    "listChats carries each session's PR link and state",
    async () => {
      const { t, ids, asUser } = await fixture();
      const [before] = await asUser.query(api.mobile.listChats, {});
      expect(before).not.toHaveProperty("prUrl");
      expect(before).not.toHaveProperty("prState");
      await t.run(async (ctx) => {
        await ctx.db.patch(ids.sessionId, { prUrl: "https://github.com/vvedantb/eva/pull/1", prState: "merged" });
      });
      expect(await asUser.query(api.mobile.listChats, {})).toEqual([
        expect.objectContaining({
          sessionId: ids.sessionId,
          prUrl: "https://github.com/vvedantb/eva/pull/1",
          prState: "merged",
        }),
      ]);
    },
    TIMEOUT_MS,
  );

  test(
    "sendMessage delivers to each chat kind with its sticky model",
    async () => {
      const { t, ids, asUser } = await fixture();
      await asUser.mutation(api.mobile.sendMessage, { target: ids.sessionId, message: " hi session " });
      await asUser.mutation(api.mobile.sendMessage, { target: ids.taskId, message: "hi task" });
      await asUser.mutation(api.mobile.sendMessage, { target: ids.projectId, message: "hi project" });
      expect(await sent(t, ids.chatId)).toEqual([
        { content: "hi session", model: "codex:gpt-5.6-sol", userId: ids.userId },
      ]);
      // A quick task chats in its session's Main chat, on the chat's own
      // model (seeded from the task's run `model`).
      const taskChatId = await ownedChatId(asUser, { kind: "task", taskId: ids.taskId });
      expect(await sent(t, ids.taskId)).toEqual([]);
      expect(await sent(t, taskChatId)).toEqual([
        { content: "hi task", model: "claude:opus", userId: ids.userId },
      ]);
      // A project chats in its session's Main chat too.
      const projectChatId = await ownedChatId(asUser, { kind: "project", projectId: ids.projectId });
      expect(await sent(t, ids.projectId)).toEqual([]);
      expect(await sent(t, projectChatId)).toEqual([
        { content: "hi project", model: DEFAULT_AI_MODEL, userId: ids.userId },
      ]);
    },
    TIMEOUT_MS,
  );

  test(
    "sendMessage queues behind a quick task's running run",
    async () => {
      const { t, ids, asUser } = await fixture();
      const { sessionId, chatId } = await asUser.mutation(api.sessions.ensureOwned, { owner: { kind: "task", taskId: ids.taskId } });
      await t.run(async (ctx) => {
        const runId = await ctx.db.insert("agentRuns", { taskId: ids.taskId, status: "running", logs: [] });
        await openTurn(ctx, {
          entityId: runId,
          sessionId,
          streamingEntityId: `task-run-${runId}`,
          model: DEFAULT_AI_MODEL,
          repoId: ids.repoId,
        });
      });
      await asUser.mutation(api.mobile.sendMessage, { target: ids.taskId, message: "next" });
      const queued = await t.run((ctx) =>
        ctx.db
          .query("queuedMessages")
          .withIndex("by_parent_and_order", (q) => q.eq("parentId", chatId))
          .collect(),
      );
      expect(queued.map((row) => row.content)).toEqual(["next"]);
    },
    TIMEOUT_MS,
  );

  test(
    "sendMessage refuses a closed chat and a repo you cannot access",
    async () => {
      const { ids, asUser } = await fixture();
      await expect(
        asUser.mutation(api.mobile.sendMessage, { target: ids.archivedChatId, message: "hi" }),
      ).rejects.toThrow("This chat is closed");
      await expect(
        asUser.mutation(api.mobile.sendMessage, { target: ids.strangerTaskId, message: "hi" }),
      ).rejects.toThrow("Not authorized");
      await expect(asUser.mutation(api.mobile.sendMessage, { target: "nope", message: "hi" })).rejects.toThrow(
        "Chat not found",
      );
    },
    TIMEOUT_MS,
  );

  test(
    "stopTurn clears the running turn and refuses a stranger's chat",
    async () => {
      const { t, ids, asUser } = await fixture();
      const requestedAt = Date.now();
      // A project's turn runs on its session chat.
      const { chatId: projectChatId } = await asUser.mutation(api.sessions.ensureOwned, {
        owner: { kind: "project", projectId: ids.projectId },
      });
      await t.run(async (ctx) => {
        await ctx.db.patch(ids.chatId, { pendingTurn: { prompt: "work", requestedAt } });
        await ctx.db.patch(projectChatId, { pendingTurn: { prompt: "work", requestedAt } });
      });
      await asUser.mutation(api.mobile.stopTurn, { target: ids.sessionId });
      await asUser.mutation(api.mobile.stopTurn, { target: ids.projectId });
      await asUser.mutation(api.mobile.stopTurn, { target: ids.taskId });
      const [chat, projectChat] = await t.run(async (ctx) => [
        await ctx.db.get(ids.chatId),
        await ctx.db.get(projectChatId),
      ]);
      expect(chat?.pendingTurn).toBeUndefined();
      expect(projectChat?.pendingTurn).toBeUndefined();
      await expect(asUser.mutation(api.mobile.stopTurn, { target: ids.strangerTaskId })).rejects.toThrow(
        "Not authorized",
      );
    },
    TIMEOUT_MS,
  );

  test(
    "startSession creates a session whose Main chat holds the prompt",
    async () => {
      const { t, ids, asUser } = await fixture();
      const { sessionId, numId } = await asUser.mutation(api.mobile.startSession, {
        repoId: ids.repoId,
        prompt: "Add dark mode",
      });
      expect(numId).toBeGreaterThan(0);
      const chat = await asUser.query(api.mobile.getChat, { target: sessionId });
      expect(chat).toMatchObject({ kind: "session", canReply: true });
      if (!chat) throw new Error("no chat");
      expect(await sent(t, chat.parentId)).toEqual([
        { content: "Add dark mode", model: DEFAULT_AI_MODEL, userId: ids.userId },
      ]);
      await expect(asUser.mutation(api.mobile.startSession, { repoId: ids.repoId, prompt: "  " })).rejects.toThrow();
    },
    TIMEOUT_MS,
  );

  test(
    "getChat carries the sticky traits and the live sandbox branch",
    async () => {
      const { t, ids, asUser } = await fixture();
      await t.run(async (ctx) => {
        await ctx.db.patch(ids.chatId, { lastReasoningLevel: "high", lastFastMode: true });
        await ctx.db.patch(ids.sessionId, { sandboxBranch: "eva/fix-login", branchName: "eva/fix-login" });
      });
      expect(await asUser.query(api.mobile.getChat, { target: ids.sessionId })).toMatchObject({
        traits: { effortLevel: "high", fastMode: true },
        intendedBranch: "eva/fix-login",
      });
      // A stopped sandbox has no worktree, so its last branch is not shown.
      await t.run((ctx) => ctx.db.patch(ids.sessionId, { status: "closed" }));
      expect(await asUser.query(api.mobile.getChat, { target: ids.sessionId })).not.toHaveProperty("sandboxBranch");
      await t.run((ctx) => ctx.db.patch(ids.sessionId, { status: "active" }));
      expect(await asUser.query(api.mobile.getChat, { target: ids.sessionId })).toMatchObject({
        sandboxBranch: "eva/fix-login",
      });
    },
    TIMEOUT_MS,
  );

  test(
    "getChat says whether the sandbox runs, as the web composer reads it",
    async () => {
      const { t, ids, asUser } = await fixture();
      // A task's and a project's sandbox is its session's.
      const owned = await Promise.all([
        asUser.mutation(api.sessions.ensureOwned, { owner: { kind: "task", taskId: ids.taskId } }),
        asUser.mutation(api.sessions.ensureOwned, { owner: { kind: "project", projectId: ids.projectId } }),
      ]);
      const sessionIds = [ids.sessionId, ...owned.map((row) => row.sessionId)];
      const awake = async () =>
        Promise.all(
          [ids.sessionId, ids.taskId, ids.projectId].map(
            async (target) => (await asUser.query(api.mobile.getChat, { target }))?.sandboxActive,
          ),
        );
      const setStatus = (status: "closed" | "active") =>
        t.run(async (ctx) => {
          for (const sessionId of sessionIds) await ctx.db.patch(sessionId, { status });
        });
      await setStatus("closed");
      expect(await awake()).toEqual([false, false, false]);
      await setStatus("active");
      expect(await awake()).toEqual([true, true, true]);
    },
    TIMEOUT_MS,
  );

  test(
    "getChat carries the pull request the web Review pane diffs",
    async () => {
      const { t, ids, asUser } = await fixture();
      const prUrl = "https://github.com/vvedantb/eva/pull/12";
      const projectPr = "https://github.com/vvedantb/eva/pull/13";
      expect(await asUser.query(api.mobile.getChat, { target: ids.sessionId })).not.toHaveProperty("prUrl");
      await t.run(async (ctx) => {
        await ctx.db.patch(ids.sessionId, { prUrl });
        await ctx.db.patch(ids.taskId, { prUrl });
        await ctx.db.patch(ids.projectId, { prUrl: projectPr });
      });
      expect(await asUser.query(api.mobile.getChat, { target: ids.sessionId })).toMatchObject({ prUrl });
      expect(await asUser.query(api.mobile.getChat, { target: ids.taskId })).toMatchObject({ prUrl });
      expect(await asUser.query(api.mobile.getChat, { target: ids.projectId })).toMatchObject({ prUrl: projectPr });
      // A task in a project ships through the project's pull request.
      await t.run((ctx) => ctx.db.patch(ids.taskId, { projectId: ids.projectId }));
      expect(await asUser.query(api.mobile.getChat, { target: ids.taskId })).toMatchObject({ prUrl: projectPr });
    },
    TIMEOUT_MS,
  );

  test(
    "setChatModel sets the sticky model and traits a reply then uses",
    async () => {
      const { t, ids, asUser } = await fixture();
      await asUser.mutation(api.mobile.setChatModel, { target: ids.sessionId, model: "claude:opus", reasoningLevel: "low" });
      await asUser.mutation(api.mobile.setChatModel, { target: ids.projectId, model: "claude:opus" });
      await asUser.mutation(api.mobile.setChatModel, { target: ids.projectId, reasoningLevel: "low" });
      expect(await asUser.query(api.mobile.getChat, { target: ids.sessionId })).toMatchObject({
        model: "claude:opus",
        traits: { effortLevel: "low" },
      });
      expect(await asUser.query(api.mobile.getChat, { target: ids.projectId })).toMatchObject({
        model: "claude:opus",
        traits: { effortLevel: "low" },
      });
      await asUser.mutation(api.mobile.sendMessage, { target: ids.sessionId, message: "hi" });
      expect(await sent(t, ids.chatId)).toEqual([{ content: "hi", model: "claude:opus", userId: ids.userId }]);
      await expect(
        asUser.mutation(api.mobile.setChatModel, { target: ids.archivedChatId, model: "claude:opus" }),
      ).rejects.toThrow("This chat is closed");
      await expect(
        asUser.mutation(api.mobile.setChatModel, { target: ids.strangerTaskId, model: "claude:opus" }),
      ).rejects.toThrow("Not authorized");
    },
    TIMEOUT_MS,
  );

  test(
    "a quick task on its session picks its model and traits on the session chat, and a reply runs on them",
    async () => {
      const { t, ids, asUser } = await fixture();
      const { chatId } = await asUser.mutation(api.sessions.ensureOwned, { owner: { kind: "task", taskId: ids.taskId } });
      // Shown as the task, read and written as its session's Main chat.
      expect(await asUser.query(api.mobile.getChat, { target: ids.taskId })).toMatchObject({
        kind: "task",
        parentId: chatId,
        model: "claude:opus",
        accountOwnerId: ids.userId,
        task: { id: ids.taskId, sessionChatId: chatId },
      });
      await asUser.mutation(api.mobile.setChatModel, { target: ids.taskId, model: "claude:sonnet", reasoningLevel: "low" });
      expect(await asUser.query(api.mobile.getChat, { target: chatId })).toMatchObject({
        kind: "task",
        model: "claude:sonnet",
        traits: { effortLevel: "low" },
      });
      // The run's model on the task row is untouched.
      expect((await t.run((ctx) => ctx.db.get(ids.taskId)))?.model).toBe("claude:opus");
      await asUser.mutation(api.mobile.sendMessage, { target: ids.taskId, message: "hi" });
      expect(await sent(t, chatId)).toEqual([{ content: "hi", model: "claude:sonnet", userId: ids.userId }]);
    },
    TIMEOUT_MS,
  );

  test(
    "getChat carries a session chat's sticky account, which anyone in the session may change",
    async () => {
      const { t, ids, asUser } = await fixture();
      const accountId = await t.run((ctx) =>
        ctx.db.insert("userProviderAccounts", {
          userId: ids.userId,
          provider: "codex",
          label: "Mine",
          credentials: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      );
      // The web session picker's own mutation.
      await asUser.mutation(api.sessionChats.setProviderAccountId, { chatId: ids.chatId, providerAccountId: accountId });
      const chat = await asUser.query(api.mobile.getChat, { target: ids.sessionId });
      expect(chat).toMatchObject({ providerAccountId: accountId, session: { chatId: ids.chatId } });
      expect(chat).not.toHaveProperty("accountOwnerId");
      expect(await asUser.query(api.mobile.getChat, { target: ids.projectId })).toMatchObject({
        accountOwnerId: ids.userId,
        project: { id: ids.projectId },
      });
    },
    TIMEOUT_MS,
  );

  test(
    "startSession takes the model picker's account: null is Team, absent the user's own default",
    async () => {
      const { t, ids, asUser } = await fixture();
      const accountId = await t.run((ctx) =>
        ctx.db.insert("userProviderAccounts", {
          userId: ids.userId,
          provider: "codex",
          label: "Mine",
          credentials: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      );
      const accountOf = async (sessionId: Id<"sessions">) =>
        (await asUser.query(api.mobile.getChat, { target: sessionId }))?.providerAccountId;
      const model = "codex:gpt-5.6-sol";
      const picked = await asUser.mutation(api.mobile.startSession, { repoId: ids.repoId, prompt: "a", model, providerAccountId: accountId });
      const team = await asUser.mutation(api.mobile.startSession, { repoId: ids.repoId, prompt: "b", model, providerAccountId: null });
      expect(await accountOf(picked.sessionId)).toBe(accountId);
      expect(await accountOf(team.sessionId)).toBeUndefined();
    },
    TIMEOUT_MS,
  );

  test(
    "startSession takes the composer footer's model, traits and base branch",
    async () => {
      const { t, ids, asUser } = await fixture();
      const { sessionId } = await asUser.mutation(api.mobile.startSession, {
        repoId: ids.repoId,
        prompt: "Add dark mode",
        model: "claude:opus",
        reasoningLevel: "low",
        baseBranch: "staging",
      });
      const session = await t.run((ctx) => ctx.db.get(sessionId));
      expect(session).toMatchObject({ baseBranch: "staging", lastModel: "claude:opus", lastReasoningLevel: "low" });
      const chat = await asUser.query(api.mobile.getChat, { target: sessionId });
      if (!chat) throw new Error("no chat");
      expect(await sent(t, chat.parentId)).toEqual([
        { content: "Add dark mode", model: "claude:opus", userId: ids.userId },
      ]);
    },
    TIMEOUT_MS,
  );

  test(
    "the review screen's Revert, blocker fix and Stack start sessions as the web does",
    async () => {
      const { t, ids, asUser } = await fixture();
      // Revert (and a blocker fix): a titled session on the branch it must land on,
      // with the shared `revertSessionRequest` (or `PrRemedy`) prompt.
      const revert = { title: "Revert #7", message: "Revert merge commit `abc123` on `staging`.", baseBranch: "staging" };
      const reverted = await asUser.mutation(api.mobile.startSession, {
        repoId: ids.repoId,
        title: revert.title,
        prompt: revert.message,
        baseBranch: revert.baseBranch,
      });
      expect(await t.run((ctx) => ctx.db.get(reverted.sessionId))).toMatchObject({ title: "Revert #7", baseBranch: "staging" });
      const chat = await asUser.query(api.mobile.getChat, { target: reverted.sessionId });
      if (!chat) throw new Error("no chat");
      expect((await sent(t, chat.parentId))[0]?.content).toBe(revert.message);

      // Stack: on the PR's head branch, and the session remembers the PR it stacks on.
      const stacked = await asUser.mutation(api.mobile.startSession, {
        repoId: ids.repoId,
        prompt: "Follow up",
        baseBranch: "feature",
        stackOnPrNumber: 7,
      });
      expect(await t.run((ctx) => ctx.db.get(stacked.sessionId))).toMatchObject({ baseBranch: "feature", stackOnPrNumber: 7 });
    },
    TIMEOUT_MS,
  );

  test(
    "the Quick Tasks screen files a task in To Do without a run, lists it first and opens it as a chat",
    async () => {
      const { t, ids, asUser } = await fixture();
      // What the phone form sends: the web `createQuickTask` with its picks.
      const taskId = await asUser.mutation(api.agentTasks.createQuickTask, {
        repoId: ids.repoId,
        title: "Fix the footer",
        description: "It overlaps the tab bar",
        baseBranch: "staging",
        model: "claude:opus",
        reasoningLevel: "low",
        priority: "high",
        tags: ["frontend"],
      });
      const task = await t.run((ctx) => ctx.db.get(taskId));
      expect(task).toMatchObject({
        status: "todo",
        baseBranch: "staging",
        model: "claude:opus",
        reasoningLevel: "low",
        priority: "high",
        tags: ["frontend"],
      });
      expect(task?.run).toBeUndefined();
      // A task in a project is not in the list the web opens with.
      await asUser.mutation(api.agentTasks.createQuickTask, {
        repoId: ids.repoId,
        title: "Billing step",
        projectId: ids.projectId,
      });
      const listed = await asUser.query(api.agentTasks.getAllTasks, { repoId: ids.repoId });
      const sections = groupByTaskStatus(applyQuickTaskFilters(listed, QUICK_TASK_LIST_DEFAULTS, Date.now()));
      expect(sections.map((section) => [section.status, section.tasks.map((row) => row.title)])).toEqual([
        ["todo", ["Fix the footer"]],
        ["in_progress", []],
        ["business_review", []],
        ["code_review", ["Bump the deps"]],
        ["done", []],
        ["cancelled", []],
      ]);
      expect(await asUser.query(api.mobile.getChat, { target: taskId })).toMatchObject({ kind: "task", canReply: true });
    },
    TIMEOUT_MS,
  );

  test(
    "Run All on the Quick Tasks list starts the user's own To Do tasks with the web startExecution and skips a teammate's",
    async () => {
      const { t, ids, asUser } = await fixture();
      const mine = await asUser.mutation(api.agentTasks.createQuickTask, { repoId: ids.repoId, title: "Fix the footer" });
      const theirs = await t.run(async (ctx) => {
        const teammate = await ctx.db.insert("users", {});
        return await ctx.db.insert("agentTasks", {
          repoId: ids.repoId,
          title: "Not mine",
          status: "todo",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          createdBy: teammate,
        });
      });
      const listed = await asUser.query(api.agentTasks.getAllTasks, { repoId: ids.repoId });
      const plan = runAllPlan(listed, await asUser.query(api.auth.me, {}));
      expect(plan.owned.map((task) => task._id)).toEqual([mine]);
      expect(plan.skippedCount).toBe(1);
      const failed = await startAll(plan.owned, (task) => asUser.mutation(api.agentTasks.startExecution, { id: task._id }));
      expect(failed).toBe(0);
      const runsOf = (taskId: Id<"agentTasks">) =>
        t.run((ctx) => ctx.db.query("agentRuns").withIndex("by_task", (q) => q.eq("taskId", taskId)).collect());
      expect(await runsOf(mine)).toHaveLength(1);
      expect(await runsOf(theirs)).toHaveLength(0);
      // A second Run (the row menu's "Run Eva") on a task that is running fails and is counted, not thrown.
      expect(await startAll(plan.owned, (task) => asUser.mutation(api.agentTasks.startExecution, { id: task._id }))).toBe(1);
    },
    TIMEOUT_MS,
  );

  test(
    "a quick-task draft saved on the phone is listed on any device and becomes a To Do task on Create",
    async () => {
      const { t, ids, asUser } = await fixture();
      // What the phone saves when the form is left with text in it: the web `saveDraft` fields.
      const draftId = await asUser.mutation(api.agentTasks.saveDraft, {
        repoId: ids.repoId,
        title: "Half an idea",
        description: "More later",
        baseBranch: "staging",
      });
      // Left again after an edit: the same draft, not a second one.
      await asUser.mutation(api.agentTasks.saveDraft, { id: draftId, repoId: ids.repoId, title: "Half an idea, v2" });
      const drafts = visibleDrafts(await asUser.query(api.agentTasks.listDrafts, { repoId: ids.repoId }));
      expect(drafts.map((draft) => draft.title)).toEqual(["Half an idea, v2"]);
      // Drafts are not on the list.
      const listed = await asUser.query(api.agentTasks.getAllTasks, { repoId: ids.repoId });
      expect(applyQuickTaskFilters(listed, QUICK_TASK_LIST_DEFAULTS, Date.now()).map((task) => task.title)).not.toContain(
        "Half an idea, v2",
      );
      await asUser.mutation(api.agentTasks.activateDraft, { id: draftId, title: "Whole idea", tags: ["ui"] });
      expect(await t.run((ctx) => ctx.db.get(draftId))).toMatchObject({ status: "todo", title: "Whole idea" });
      expect(await asUser.query(api.agentTasks.listDrafts, { repoId: ids.repoId })).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    "a phone @mention and /skill go on the wire as the backend's own tokens, stored as sent on a reply and a new session",
    async () => {
      const { t, ids, asUser } = await fixture();
      // What the phone composer sends after picking Grace and a skill. A
      // production-shaped id: convex-test ids hold a `;`, outside the token charset.
      const graceId = "k17grace00000000000000000000000g";
      const skillId = systemSkillTokenId("eva-capture");
      const message = tokenizeMentionText("ask @Grace Hopper to /eva-capture", {
        mentionMap: new Map([["Grace Hopper", graceId]]),
        skillMap: new Map([["eva-capture", skillId]]),
      });
      // The regexes `notifyChatMentions` and the skill resolver read.
      expect([...message.matchAll(MENTION_TOKEN_REGEX)].map((match) => [match[1], match[2]])).toEqual([
        ["Grace Hopper", graceId],
      ]);
      expect([...message.matchAll(SKILL_TOKEN_REGEX)].map((match) => [match[1], match[2]])).toEqual([
        ["eva-capture", skillId],
      ]);
      await asUser.mutation(api.mobile.sendMessage, { target: ids.sessionId, message });
      expect(await sent(t, ids.chatId)).toEqual([expect.objectContaining({ content: message })]);
      const { sessionId } = await asUser.mutation(api.mobile.startSession, { repoId: ids.repoId, prompt: message });
      const chat = await asUser.query(api.mobile.getChat, { target: sessionId });
      if (!chat) throw new Error("no chat");
      expect(await sent(t, chat.parentId)).toEqual([expect.objectContaining({ content: message })]);
    },
    TIMEOUT_MS,
  );

  test(
    "the session menu renames, archives and unarchives a session, as the web row menu",
    async () => {
      const { t, ids, asUser } = await fixture();
      await t.run((ctx) => ctx.db.patch(ids.sessionId, { branchName: "eva/login", sandboxId: "sbx-1" }));
      const [row] = await asUser.query(api.mobile.listChats, {});
      expect(row).toMatchObject({
        repoId: ids.repoId,
        branchName: "eva/login",
        webPath: "/vvedantb/eva/sessions/42",
      });
      expect(await asUser.query(api.mobile.getChat, { target: ids.sessionId })).toMatchObject({
        session: { id: ids.sessionId, title: "Fix the login bug", archived: false },
      });

      // Rename: the web `sessions.update`.
      await asUser.mutation(api.sessions.update, { id: ids.sessionId, title: "Fix the sign-in bug" });
      expect((await asUser.query(api.mobile.listChats, {})).map((r) => r.title)).toEqual(["Fix the sign-in bug"]);

      // Archive stops the sandbox first, then leaves the Active list for Archived.
      await asUser.mutation(api.mobile.archiveSession, { sessionId: ids.sessionId });
      const archived = await t.run((ctx) => ctx.db.get(ids.sessionId));
      expect(archived).toMatchObject({ archive: { archivedAt: expect.any(Number) }, status: "closed" });
      expect(await asUser.query(api.mobile.listChats, {})).toEqual([]);
      expect((await asUser.query(api.mobile.listChats, { archived: true })).map((r) => r.sessionId)).toEqual([
        ids.sessionId,
      ]);
      // Read-only while archived, as the web session page.
      expect(await asUser.query(api.mobile.getChat, { target: ids.sessionId })).toMatchObject({
        canReply: false,
        session: { archived: true },
      });

      // Unarchive: the web `sessions.unarchive`.
      await asUser.mutation(api.sessions.unarchive, { id: ids.sessionId });
      expect((await asUser.query(api.mobile.listChats, {})).map((r) => r.sessionId)).toEqual([ids.sessionId]);
    },
    TIMEOUT_MS,
  );

  test(
    "archiveSession refuses a session you cannot access",
    async () => {
      const { t, asUser } = await fixture();
      const strangerSessionId = await t.run(async (ctx) => {
        const strangerRepo = await ctx.db
          .query("githubRepos")
          .filter((q) => q.eq(q.field("owner"), "someone"))
          .unique();
        if (!strangerRepo) throw new Error("fixture");
        return await ctx.db.insert("sessions", {
          owner: { kind: "standalone" },
          repoId: strangerRepo._id,
          userId: strangerRepo.connectedBy,
          title: "Not yours",
          status: "closed",
        });
      });
      await expect(asUser.mutation(api.mobile.archiveSession, { sessionId: strangerSessionId })).rejects.toThrow();
      expect(await t.run((ctx) => ctx.db.get(strangerSessionId))).not.toHaveProperty("archive");
    },
    TIMEOUT_MS,
  );

  test(
    "projects.create makes the phone's new project: tasks only goes to Business Review with a branch, an interview starts as a draft",
    async () => {
      const { t, ids, asUser } = await fixture();
      const tasksOnly = await asUser.mutation(api.projects.create, {
        repoId: ids.repoId,
        title: "Offline drafts",
        rawInput: "Keep a draft when the network drops.",
        baseBranch: "main",
        priority: "high",
        skipPlanning: true,
      });
      const interview = await asUser.mutation(api.projects.create, {
        repoId: ids.repoId,
        title: "Copy pass",
        rawInput: "Shorter onboarding copy.",
        baseBranch: "main",
        skipPlanning: false,
      });
      const listed = await asUser.query(api.projects.list, { repoId: ids.repoId });
      const byId = new Map(listed.map((project) => [project._id, project]));
      expect(byId.get(tasksOnly)).toMatchObject({
        phase: "business_review",
        planningMode: "tasks_only",
        description: "Keep a draft when the network drops.",
        priority: "high",
        baseBranch: "main",
        userId: ids.userId,
      });
      expect(byId.get(tasksOnly)?.branchName).toBeTruthy();
      expect(byId.get(interview)).toMatchObject({ phase: "draft", planningMode: "interview" });
      expect(byId.get(interview)).not.toHaveProperty("description");
      // The interview opens on the user's own description, which the phone Plan tab shows.
      const detail = await asUser.query(api.projects.get, { id: interview });
      expect(detail?.conversationHistory.map((turn) => [turn.role, turn.content])).toEqual([["user", "Shorter onboarding copy."]]);
      // Each takes the repo's next project number.
      const numbers = await t.run(async (ctx) => [(await ctx.db.get(tasksOnly))?.numId, (await ctx.db.get(interview))?.numId]);
      expect(new Set(numbers).size).toBe(2);
    },
    TIMEOUT_MS,
  );

  test(
    "projects.create refuses a repo you cannot access",
    async () => {
      const { t, asUser } = await fixture();
      const strangerRepoId = await t.run(async (ctx) => {
        const repo = await ctx.db
          .query("githubRepos")
          .filter((q) => q.eq(q.field("owner"), "someone"))
          .unique();
        if (!repo) throw new Error("fixture");
        return repo._id;
      });
      await expect(
        asUser.mutation(api.projects.create, { repoId: strangerRepoId, title: "Nope", rawInput: "Nope", skipPlanning: true }),
      ).rejects.toThrow();
      expect(await t.run((ctx) => ctx.db.query("projects").withIndex("by_repo_and_deleted", (q) => q.eq("repoId", strangerRepoId).eq("deletedAt", undefined)).collect())).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test("sessionMenuActions lists the web row menu in its order and groups, per list and view", () => {
    const pr = { branchName: "eva/login", prUrl: "https://github.com/vvedantb/eva/pull/1" };
    expect(sessionMenuActions({ archived: false, simpleView: false, ...pr })).toEqual([
      ["rename", "regenerateTitle", "copyTitle", "copyLink", "copyBranchName", "openPr"],
      ["archive"],
    ]);
    expect(sessionMenuActions({ archived: true, simpleView: false, ...pr })).toEqual([
      ["copyTitle", "copyLink", "copyBranchName", "openPr"],
      ["unarchive"],
    ]);
    expect(sessionMenuActions({ archived: false, simpleView: true, ...pr })).toEqual([
      ["rename", "regenerateTitle", "copyTitle", "copyLink"],
      ["archive"],
    ]);
  });

  test("mentionTokensToChipLinks marks each sent token as a chip link and leaves code as typed", () => {
    const graceId = "k17grace00000000000000000000000g";
    const skillId = systemSkillTokenId("eva-capture");
    const content = `ask @[Grace](${graceId}) to /[eva-capture](${skillId}), not \`@[Grace](${graceId})\``;
    const marked = mentionTokensToChipLinks(content);
    expect(marked).toBe(
      `ask [Grace](#mention:at:${graceId}) to [eva-capture](#mention:slash:${skillId}), not \`@[Grace](${graceId})\``,
    );
    expect(parseMentionChipHref(`#mention:slash:${skillId}`)).toEqual({ kind: "slash", id: skillId });
    expect(parseMentionChipHref("https://example.com")).toBeNull();
  });

  test("messageLinkHref aims a web path or URL at one message", () => {
    expect(messageLinkHref("/vvedantb/eva/sessions/42", "m1")).toBe("/vvedantb/eva/sessions/42?message=m1");
    expect(messageLinkHref("/vvedantb/eva/sessions/42?chat=2", "m1")).toBe(
      "/vvedantb/eva/sessions/42?chat=2&message=m1",
    );
    expect(messageLinkHref("https://eva.dev/a?message=old", "m2")).toBe("https://eva.dev/a?message=m2");
  });
});
