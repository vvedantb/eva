import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { openSessionChatTurn } from "../convex/_chat/turnStore";

/**
 * Since sessions hold several chats, a session's messages hang off its
 * `sessionChats` rows, not the session id. Restore, title regeneration, the
 * sidebar preview, the seeded-restore alert and the scope check must all read
 * and write through the chat.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|session-chat-reads";

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
      repoId,
      userId,
      title: "Seed invoices",
      status: "active",
      numId: 1,
      sandboxId: "sbx_1",
      branchName: "eva/session-1",
    });
    const mainChatId = await ctx.db.insert("sessionChats", {
      sessionId,
      repoId,
      userId,
      title: "Main",
      number: 1,
      isMain: true,
    });
    const sideChatId = await ctx.db.insert("sessionChats", {
      sessionId,
      repoId,
      userId,
      title: "Chat 2",
      number: 2,
      isMain: false,
    });
    await ctx.db.insert("messages", {
      parentId: mainChatId,
      role: "user",
      content: "Seed the invoices table",
      timestamp: 1_000,
    });
    const mainReplyId = await ctx.db.insert("messages", {
      parentId: mainChatId,
      role: "assistant",
      content: "Seeded 12 invoices.",
      timestamp: 2_000,
      beforeSha: "aaa",
      afterSha: "bbb",
    });
    await ctx.db.insert("messages", {
      parentId: sideChatId,
      role: "user",
      content: "Add a test",
      timestamp: 3_000,
    });
    const sideReplyId = await ctx.db.insert("messages", {
      parentId: sideChatId,
      role: "assistant",
      content: "Added a test.",
      timestamp: 4_000,
      beforeSha: "bbb",
      afterSha: "ccc",
    });
    return { userId, repoId, sessionId, mainChatId, sideChatId, mainReplyId, sideReplyId };
  });
  return { t, asUser: t.withIdentity({ subject: CLERK_ID }), ...ids };
}

describe("session reads go through its chats", () => {
  test(
    "restore accepts a reply from any chat of the session and numbers it within that chat",
    async () => {
      const f = await fixture();
      const main = await f.t.query(internal.sessions.getRevertContext, {
        sessionId: f.sessionId,
        messageId: f.mainReplyId,
      });
      expect(main).toMatchObject({
        status: "ok",
        beforeSha: "aaa",
        turnNumber: 1,
        chatId: f.mainChatId,
      });
      const side = await f.t.query(internal.sessions.getRevertContext, {
        sessionId: f.sessionId,
        messageId: f.sideReplyId,
      });
      expect(side).toMatchObject({
        status: "ok",
        turnNumber: 1,
        chatId: f.sideChatId,
      });
    },
    TIMEOUT_MS,
  );

  test(
    "restore refuses while any chat of the session has a turn open",
    async () => {
      const f = await fixture();
      await f.t.run(async (ctx) =>
        openSessionChatTurn(ctx, {
          chatId: f.sideChatId,
          sessionId: f.sessionId,
          streamingEntityId: String(f.sideChatId),
          model: "claude:sonnet",
          repoId: f.repoId,
        }),
      );
      const context = await f.t.query(internal.sessions.getRevertContext, {
        sessionId: f.sessionId,
        messageId: f.mainReplyId,
      });
      expect(context.status).toBe("turn_open");
    },
    TIMEOUT_MS,
  );

  test(
    "restore rejects a message from another session",
    async () => {
      const f = await fixture();
      const otherSessionId = await f.t.run(async (ctx) =>
        ctx.db.insert("sessions", {
          repoId: f.repoId,
          userId: f.userId,
          title: "Other",
          status: "active",
          numId: 2,
        }),
      );
      await expect(
        f.t.query(internal.sessions.getRevertContext, {
          sessionId: otherSessionId,
          messageId: f.mainReplyId,
        }),
      ).rejects.toThrow("Message not found");
    },
    TIMEOUT_MS,
  );

  test(
    "title regeneration reads the Main chat",
    async () => {
      const f = await fixture();
      const context = await f.t.query(internal.sessions.getTitleContext, {
        sessionId: f.sessionId,
      });
      expect(context?.messages.map((message) => message.content)).toEqual([
        "Seed the invoices table",
        "Seeded 12 invoices.",
      ]);
    },
    TIMEOUT_MS,
  );

  test(
    "sidebar preview reads the Main chat's first user message",
    async () => {
      const f = await fixture();
      expect(
        await f.asUser.query(api.sessions.getFirstMessagePreview, {
          id: f.sessionId,
        }),
      ).toBe("Seed the invoices table");
    },
    TIMEOUT_MS,
  );

  test(
    "the seeded-restore alert lands in the Main chat",
    async () => {
      const f = await fixture();
      await f.t.mutation(internal._chat.seededRestoreAlert.insert, {
        parentId: f.sessionId,
        error: "pg_restore failed",
      });
      const alerts = await f.t.run(async (ctx) =>
        (
          await ctx.db
            .query("messages")
            .withIndex("by_parent", (q) => q.eq("parentId", f.mainChatId))
            .collect()
        ).filter((message) => message.isSystemAlert === true),
      );
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.errorDetail).toBe("pg_restore failed");
    },
    TIMEOUT_MS,
  );

  test(
    "the scope check resolves a session chat's repo",
    async () => {
      const f = await fixture();
      const context = await f.t.query(
        internal._scopeCheck.queries.getTurnContext,
        { messageId: f.mainReplyId },
      );
      expect(context).toEqual({
        repoId: f.repoId,
        beforeSha: "aaa",
        afterSha: "bbb",
        prompt: "Seed the invoices table",
        reply: "Seeded 12 invoices.",
      });
    },
    TIMEOUT_MS,
  );
});
