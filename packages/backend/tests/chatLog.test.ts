import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { renderChatLogMarkdown } from "@eva/shared/chatLog";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { recordTurnChange } from "../convex/chatLog";
import { buildEditPrompt } from "../convex/_sessions/prompts";

/**
 * The chat Log: append-only entries per session / quick task / project,
 * written by the agent (log_entry), the user (Add note) and Eva itself
 * (answered questions, turn commits).
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|chat-log";
const STRANGER_CLERK_ID = "clerk|chat-log-stranger";

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    await ctx.db.insert("users", { clerkId: STRANGER_CLERK_ID });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const sessionId = await ctx.db.insert("sessions", {
      repoId,
      userId,
      title: "Build the log",
      status: "active",
      numId: 1,
    });
    const taskId = await ctx.db.insert("agentTasks", {
      repoId,
      title: "Quick log",
      status: "code_review",
      numId: 2,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    });
    const projectId = await ctx.db.insert("projects", {
      repoId,
      userId,
      title: "Log project",
      phase: "in_progress",
      rawInput: "log",
      numId: 3,
      updatedAt: now,
    });
    return { sessionId, taskId, projectId };
  });
  return {
    t,
    asUser: t.withIdentity({ subject: CLERK_ID }),
    asStranger: t.withIdentity({ subject: STRANGER_CLERK_ID }),
    ...ids,
  };
}

describe("chat log", () => {
  test(
    "entries stay with their chat on all three surfaces",
    async () => {
      const f = await fixture();
      const sources = [
        { kind: "session" as const, sessionId: f.sessionId },
        { kind: "task" as const, taskId: f.taskId },
        { kind: "project" as const, projectId: f.projectId },
      ];
      for (const source of sources) {
        await f.asUser.mutation(api.chatLog.append, {
          source,
          kind: "note",
          author: "user",
          title: `Note for ${source.kind}`,
        });
      }
      for (const source of sources) {
        const rows = await f.asUser.query(api.chatLog.listForSource, {
          source,
        });
        expect(rows.map((row) => row.title)).toEqual([
          `Note for ${source.kind}`,
        ]);
      }
    },
    TIMEOUT_MS,
  );

  test(
    "a superseded decision is marked and drops out of current decisions",
    async () => {
      const f = await fixture();
      const source = { kind: "session" as const, sessionId: f.sessionId };
      const first = await f.asUser.mutation(api.chatLog.append, {
        source,
        kind: "decision",
        author: "agent",
        title: "Store the log as one markdown file",
      });
      await f.asUser.mutation(api.chatLog.append, {
        source,
        kind: "decision",
        author: "agent",
        title: "Store the log as rows",
        body: "Rows cannot be rewritten by accident.",
        supersedesId: first,
      });
      const rows = await f.asUser.query(api.chatLog.listForSource, { source });
      expect(rows[0]?.supersededById).toBe(rows[1]?._id);
      const markdown = await f.asUser.query(api.chatLog.markdownForSource, {
        source,
      });
      const current = markdown.split("## Timeline")[0] ?? "";
      expect(current).toContain("Store the log as rows");
      expect(current).not.toContain("one markdown file");
    },
    TIMEOUT_MS,
  );

  test(
    "supersedes must name an entry in the same chat",
    async () => {
      const f = await fixture();
      const other = await f.asUser.mutation(api.chatLog.append, {
        source: { kind: "task", taskId: f.taskId },
        kind: "decision",
        author: "agent",
        title: "Task decision",
      });
      await expect(
        f.asUser.mutation(api.chatLog.append, {
          source: { kind: "session", sessionId: f.sessionId },
          kind: "decision",
          author: "agent",
          title: "Session decision",
          supersedesId: other,
        }),
      ).rejects.toThrow("supersedesId");
    },
    TIMEOUT_MS,
  );

  test(
    "a user without access can neither read nor write",
    async () => {
      const f = await fixture();
      const source = { kind: "session" as const, sessionId: f.sessionId };
      await expect(
        f.asStranger.mutation(api.chatLog.append, {
          source,
          kind: "note",
          author: "user",
          title: "Sneaky",
        }),
      ).rejects.toThrow("Not authorized");
      expect(
        await f.asStranger.query(api.chatLog.listForSource, { source }),
      ).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    "claiming a question answer logs the question and answer",
    async () => {
      const f = await fixture();
      const entityId = String(f.projectId);
      const payload = JSON.stringify({
        questions: [
          { question: "Which tab?", header: "Tab", options: [], multiSelect: false },
        ],
      });
      await f.asUser.mutation(api.pendingQuestions.post, {
        entityId,
        toolUseId: "tool-1",
        payload,
      });
      await f.asUser.mutation(api.pendingQuestions.answer, {
        entityId,
        toolUseId: "tool-1",
        answer: JSON.stringify({ "Which tab?": "Documents" }),
      });
      await f.asUser.mutation(api.pendingQuestions.claimAnswer, {
        entityId,
        toolUseId: "tool-1",
      });
      const rows = await f.asUser.query(api.chatLog.listForSource, {
        source: { kind: "project", projectId: f.projectId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        kind: "question",
        author: "user",
        title: "Which tab?",
        body: "Q: Which tab?\nA: Documents",
      });
    },
    TIMEOUT_MS,
  );

  test(
    "a committing turn is logged once; a turn with no commits is not",
    async () => {
      const f = await fixture();
      await f.t.run(async (ctx) => {
        const messageId = await ctx.db.insert("messages", {
          parentId: f.taskId,
          role: "assistant",
          content: "Added the Log to the Documents tab.\nMore detail.",
          timestamp: Date.now(),
        });
        const message = await ctx.db.get(messageId);
        if (!message) throw new Error("message missing");
        await recordTurnChange(ctx, String(f.taskId), message, "aaa", "aaa");
        await recordTurnChange(ctx, String(f.taskId), message, "aaa", "bbb");
        await recordTurnChange(ctx, String(f.taskId), message, "aaa", "bbb");
      });
      const rows = await f.asUser.query(api.chatLog.listForSource, {
        source: { kind: "task", taskId: f.taskId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        kind: "change",
        author: "system",
        title: "Added the Log to the Documents tab.",
        beforeSha: "aaa",
        afterSha: "bbb",
      });
    },
    TIMEOUT_MS,
  );

  test(
    "a turn in a parallel session chat lands in the session's Log",
    async () => {
      const f = await fixture();
      await f.t.run(async (ctx) => {
        const session = await ctx.db.get(f.sessionId);
        if (!session) throw new Error("session missing");
        const chatId = await ctx.db.insert("sessionChats", {
          sessionId: f.sessionId,
          repoId: session.repoId,
          userId: session.userId,
          title: "Chat 2",
          number: 2,
          isMain: false,
        });
        const messageId = await ctx.db.insert("messages", {
          parentId: chatId,
          role: "assistant",
          content: "Built it in a parallel chat.",
          timestamp: Date.now(),
        });
        const message = await ctx.db.get(messageId);
        if (!message) throw new Error("message missing");
        await recordTurnChange(ctx, String(chatId), message, "aaa", "bbb");
      });
      const rows = await f.asUser.query(api.chatLog.listForSource, {
        source: { kind: "session", sessionId: f.sessionId },
      });
      expect(rows.map((row) => row.title)).toEqual([
        "Built it in a parallel chat.",
      ]);
    },
    TIMEOUT_MS,
  );

  test(
    "the repo Documents list shows one Log per chat, newest first",
    async () => {
      const f = await fixture();
      const session = { kind: "session" as const, sessionId: f.sessionId };
      const decisionId = await f.asUser.mutation(api.chatLog.append, {
        source: session,
        kind: "decision",
        author: "agent",
        title: "Use a table",
      });
      await f.asUser.mutation(api.chatLog.append, {
        source: session,
        kind: "decision",
        author: "agent",
        title: "Use an append-only table",
        supersedesId: decisionId,
      });
      await f.asUser.mutation(api.chatLog.append, {
        source: { kind: "task", taskId: f.taskId },
        kind: "note",
        author: "user",
        title: "Task note",
      });

      const repoId = await f.t.run(
        async (ctx) => (await ctx.db.get(f.sessionId))?.repoId,
      );
      if (!repoId) throw new Error("repo missing");
      const logs = await f.asUser.query(api.chatLog.listForRepo, { repoId });
      expect(
        logs.map((log) => ({
          kind: log.source?.kind,
          entryCount: log.entryCount,
          decisionCount: log.decisionCount,
          latestTitle: log.latestTitle,
        })),
      ).toEqual([
        { kind: "task", entryCount: 1, decisionCount: 0, latestTitle: "Task note" },
        {
          kind: "session",
          entryCount: 2,
          decisionCount: 1,
          latestTitle: "Use an append-only table",
        },
      ]);
      expect(
        await f.asStranger.query(api.chatLog.listForRepo, { repoId }),
      ).toEqual([]);
    },
    TIMEOUT_MS,
  );
});

describe("chat log markdown", () => {
  const day = Date.UTC(2026, 9, 12);

  test("budget keeps current decisions and drops the oldest timeline rows", () => {
    const rows = [
      { kind: "decision" as const, author: "agent" as const, title: "Keep rows", createdAt: day },
      ...Array.from({ length: 50 }, (_, index) => ({
        kind: "note" as const,
        author: "agent" as const,
        title: `Note ${index}`,
        createdAt: day + index,
      })),
    ];
    const markdown = renderChatLogMarkdown(rows, { budget: 600 });
    expect(markdown.length).toBeLessThanOrEqual(600);
    expect(markdown).toContain("## Current decisions\n- Keep rows (12 October 2026)");
    expect(markdown).toContain("Note 49");
    expect(markdown).not.toContain("Note 0\n");
    expect(markdown).toMatch(/\(\d+ older entries omitted\)/);
  });
});

test("the turn prompt tells the agent to keep the Log", () => {
  const prompt = buildEditPrompt(
    { owner: "vvedantb", name: "eva", baseBranch: "main" },
    "eva/session-1",
    "",
    "continue",
    "",
    "",
    undefined,
    5173,
  );
  expect(prompt).toContain("## Chat log (Documents tab):");
  expect(prompt).toContain("log_entry");
  expect(prompt).toContain("read_chat_log");
});
