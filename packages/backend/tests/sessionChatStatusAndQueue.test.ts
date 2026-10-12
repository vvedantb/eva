import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { openSessionChatTurn } from "../convex/_chat/turnStore";

/**
 * Since sessions hold several chats, the session composer reads turn status
 * and the queue by chat id. A null status made every follow-up start a new
 * turn (superseding the running one) instead of queueing behind it.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|session-chat-status";
const STRANGER_CLERK_ID = "clerk|session-chat-status-stranger";

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
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
      title: "Queue behind a turn",
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
    return { userId, repoId, sessionId, chatId };
  });
  return {
    t,
    asUser: t.withIdentity({ subject: CLERK_ID }),
    asStranger: t.withIdentity({ subject: STRANGER_CLERK_ID }),
    ...ids,
  };
}

describe("session chat status and queue", () => {
  test(
    "a chat with an open turn reports it running",
    async () => {
      const f = await fixture();
      expect(
        await f.asUser.query(api.turns.getChatStatus, { entityId: f.chatId }),
      ).toBeNull();

      const turnId = await f.t.run(async (ctx) =>
        openSessionChatTurn(ctx, {
          chatId: f.chatId,
          sessionId: f.sessionId,
          streamingEntityId: String(f.chatId),
          model: "claude:sonnet",
          repoId: f.repoId,
        }),
      );

      const status = await f.asUser.query(api.turns.getChatStatus, {
        entityId: f.chatId,
      });
      expect(status?.source).toBe("durable");
      expect(status?.source === "durable" && status.turnId).toBe(turnId);
    },
    TIMEOUT_MS,
  );

  test(
    "naming the session reads its Main chat's queue",
    async () => {
      const f = await fixture();
      await f.t.run(async (ctx) => {
        const now = Date.now();
        await ctx.db.insert("queuedMessages", {
          parentId: f.chatId,
          content: "and also rename the button",
          createdAt: now,
          order: now,
          userId: f.userId,
        });
      });

      const bySession = await f.asUser.query(api.queuedMessages.listByParent, {
        parentId: f.sessionId,
      });
      expect(bySession.map((row) => row.content)).toEqual([
        "and also rename the button",
      ]);
      expect(
        await f.asStranger.query(api.queuedMessages.listByParent, {
          parentId: f.sessionId,
        }),
      ).toEqual([]);
    },
    TIMEOUT_MS,
  );
});
