import { convexTest } from "convex-test";
import workflow from "@convex-dev/workflow/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import type { Id } from "../convex/_generated/dataModel";
import { DEFAULT_AI_MODEL, normalizeAIModel } from "../convex/_validators/aiModels";
import { messageLinkHref } from "@eva/shared/messageLink";
import { systemSkillTokenId, tokenizeMentionText } from "@eva/shared";
import { MENTION_TOKEN_REGEX } from "../convex/_mentions/mentionToken";
import { SKILL_TOKEN_REGEX } from "../convex/_mentions/skillToken";

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
      lastChatModel: "claude:opus",
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
      expect(await sent(t, ids.taskId)).toEqual([{ content: "hi task", model: normalizeAIModel("claude:opus"), userId: ids.userId }]);
      expect(await sent(t, ids.projectId)).toEqual([
        { content: "hi project", model: DEFAULT_AI_MODEL, userId: ids.userId },
      ]);
    },
    TIMEOUT_MS,
  );

  test(
    "sendMessage queues behind a running task turn",
    async () => {
      const { t, ids, asUser } = await fixture();
      await t.run((ctx) => ctx.db.patch(ids.taskId, { pendingTurn: { prompt: "earlier", requestedAt: Date.now() } }));
      await asUser.mutation(api.mobile.sendMessage, { target: ids.taskId, message: "next" });
      const queued = await t.run((ctx) =>
        ctx.db
          .query("queuedMessages")
          .withIndex("by_parent_and_order", (q) => q.eq("parentId", ids.taskId))
          .collect(),
      );
      expect(queued.map((row) => row.content)).toEqual(["next"]);
      const task = await t.run((ctx) => ctx.db.get(ids.taskId));
      expect(task?.pendingTurn?.prompt).toBe("earlier");
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
      await t.run(async (ctx) => {
        await ctx.db.patch(ids.chatId, { pendingTurn: { prompt: "work", requestedAt } });
        await ctx.db.patch(ids.projectId, { pendingTurn: { prompt: "work", requestedAt } });
      });
      await asUser.mutation(api.mobile.stopTurn, { target: ids.sessionId });
      await asUser.mutation(api.mobile.stopTurn, { target: ids.projectId });
      await asUser.mutation(api.mobile.stopTurn, { target: ids.taskId });
      const [chat, project] = await t.run(async (ctx) => [await ctx.db.get(ids.chatId), await ctx.db.get(ids.projectId)]);
      expect(chat?.pendingTurn).toBeUndefined();
      expect(project?.pendingTurn).toBeUndefined();
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
        asUser.mutation(api.mobile.setChatModel, { target: ids.taskId, model: "claude:opus" }),
      ).rejects.toThrow("on the web");
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

  test("messageLinkHref aims a web path or URL at one message", () => {
    expect(messageLinkHref("/vvedantb/eva/sessions/42", "m1")).toBe("/vvedantb/eva/sessions/42?message=m1");
    expect(messageLinkHref("/vvedantb/eva/sessions/42?chat=2", "m1")).toBe(
      "/vvedantb/eva/sessions/42?chat=2&message=m1",
    );
    expect(messageLinkHref("https://eva.dev/a?message=old", "m2")).toBe("https://eva.dev/a?message=m2");
  });
});
