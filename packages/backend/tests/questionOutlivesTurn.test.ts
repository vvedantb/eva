import { convexTest } from "convex-test";
import { describe, expect, test } from "bun:test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { detachPendingQuestions } from "../convex/pendingQuestions";
import { modules } from "./_helpers/convexModules";

const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|question-outlives-turn";
const PAYLOAD = JSON.stringify({
  questions: [{ question: "Which?", options: [{ label: "A" }] }],
});

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const sessionId = await ctx.db.insert("sessions", {
      owner: { kind: "standalone" },
      repoId,
      userId,
      title: "Asks a question",
      status: "active",
      numId: 1,
    });
    const chatId = await ctx.db.insert("sessionChats", {
      sessionId,
      repoId,
      userId,
      title: "Main",
      number: 1,
      isMain: true,
    });
    const messageId = await ctx.db.insert("messages", {
      parentId: chatId,
      role: "assistant",
      content: "Which one?",
      timestamp: Date.now(),
    });
    return { chatId, messageId };
  });
  return { t, asUser: t.withIdentity({ subject: CLERK_ID }), ...ids };
}

describe("a blocking question outlives its turn", () => {
  test(
    "release drops an unanswered question",
    async () => {
      const f = await fixture();
      const args = { entityId: f.chatId, toolUseId: "tool-1" };
      await f.asUser.mutation(api.pendingQuestions.post, {
        ...args,
        payload: PAYLOAD,
      });
      expect(
        await f.asUser.mutation(api.pendingQuestions.release, args),
      ).toEqual({ answer: null });
      expect(
        await f.asUser.query(api.pendingQuestions.getActive, {
          entityId: f.chatId,
        }),
      ).toBeNull();
    },
    TIMEOUT_MS,
  );

  test(
    "release still claims an answer that landed at the deadline",
    async () => {
      const f = await fixture();
      const args = { entityId: f.chatId, toolUseId: "tool-1" };
      await f.asUser.mutation(api.pendingQuestions.post, {
        ...args,
        payload: PAYLOAD,
      });
      await f.asUser.mutation(api.pendingQuestions.answer, {
        ...args,
        answer: '{"Which?":"A"}',
      });
      expect(
        await f.asUser.mutation(api.pendingQuestions.release, args),
      ).toEqual({ answer: '{"Which?":"A"}' });
    },
    TIMEOUT_MS,
  );

  test(
    "detach moves the question onto the asker's message",
    async () => {
      const f = await fixture();
      await f.asUser.mutation(api.pendingQuestions.post, {
        entityId: f.chatId,
        toolUseId: "tool-1",
        payload: PAYLOAD,
      });
      const after = await f.t.run(async (ctx) => {
        await detachPendingQuestions(ctx.db, String(f.chatId));
        return {
          message: await ctx.db.get(f.messageId),
          rows: await ctx.db.query("pendingQuestions").collect(),
        };
      });
      expect(after.message?.pendingQuestion).toBe(PAYLOAD);
      expect(after.rows).toHaveLength(0);
    },
    TIMEOUT_MS,
  );

  test(
    "detach keeps the newest of several open questions",
    async () => {
      const f = await fixture();
      const newest = JSON.stringify({
        questions: [{ question: "Newest?", options: [{ label: "B" }] }],
      });
      const message = await f.t.run(async (ctx) => {
        const entityId = String(f.chatId);
        const rows = [
          { toolUseId: "tool-1", payload: PAYLOAD, createdAt: 1_000 },
          { toolUseId: "tool-2", payload: newest, createdAt: 3_000 },
          { toolUseId: "tool-3", payload: PAYLOAD, createdAt: 2_000 },
        ];
        for (const row of rows) {
          await ctx.db.insert("pendingQuestions", { entityId, ...row });
        }
        await detachPendingQuestions(ctx.db, entityId);
        return await ctx.db.get(f.messageId);
      });
      expect(message?.pendingQuestion).toBe(newest);
    },
    TIMEOUT_MS,
  );

  test(
    "detach drops the question once the user has written since",
    async () => {
      const f = await fixture();
      await f.asUser.mutation(api.pendingQuestions.post, {
        entityId: f.chatId,
        toolUseId: "tool-1",
        payload: PAYLOAD,
      });
      const after = await f.t.run(async (ctx) => {
        await ctx.db.insert("messages", {
          parentId: f.chatId,
          role: "user",
          content: "never mind",
          timestamp: Date.now(),
        });
        await detachPendingQuestions(ctx.db, String(f.chatId));
        return {
          message: await ctx.db.get(f.messageId),
          rows: await ctx.db.query("pendingQuestions").collect(),
        };
      });
      expect(after.message?.pendingQuestion).toBeUndefined();
      expect(after.rows).toHaveLength(0);
    },
    TIMEOUT_MS,
  );
});
