import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { openSessionChatTurn } from "../convex/_chat/turnStore";

/**
 * Session turns write their transcript under a `sessionChats` id, and the
 * sandbox callback sends that id to `attachMedia`. The action's validator once
 * accepted only session/project/task ids, so every session screenshot and
 * recording was rejected and never reached the chat message.
 *
 * `attachMedia` is public, so it must also check that the caller can access
 * the message's parent. Without that check, any signed-in user could attach
 * media to another team's chat.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|attach-media-session-chat";
const STRANGER = "clerk|attach-media-stranger";

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    await ctx.db.insert("users", { clerkId: STRANGER });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const sessionId = await ctx.db.insert("sessions", {
      repoId,
      userId,
      title: "Screenshots",
      status: "active",
      numId: 1,
    });
    const chatId = await ctx.db.insert("sessionChats", {
      sessionId,
      repoId,
      userId,
      title: "Chat 2",
      number: 2,
      isMain: false,
    });
    const messageId = await ctx.db.insert("messages", {
      parentId: chatId,
      role: "assistant",
      content: "Took a screenshot.",
      timestamp: 1_000,
    });
    const storageId = await ctx.storage.store(new Blob(["png"]));
    return { chatId, messageId, storageId };
  });
  const readMedia = async () =>
    (await t.run((ctx) => ctx.db.get(ids.messageId)))?.mediaStorageIds;
  return { t, ...ids, readMedia };
}

describe("attachMedia", () => {
  test(
    "attaches media to a message parented by a session chat",
    async () => {
      const f = await fixture();
      await f.t
        .withIdentity({ subject: CLERK_ID })
        .action(api.screenshots.attachMedia, {
          parentId: f.chatId,
          messageId: f.messageId,
          mediaStorageIds: [f.storageId],
        });
      expect(await f.readMedia()).toEqual([f.storageId]);
    },
    TIMEOUT_MS,
  );

  test(
    "attaches to the turn's own reply when a queued follow-up opened after it",
    async () => {
      const f = await fixture();
      const { turnId, nextReplyId } = await f.t.run(async (ctx) => {
        const chat = await ctx.db.get(f.chatId);
        if (!chat) throw new Error("missing chat");
        const turnId = await openSessionChatTurn(ctx, {
          chatId: f.chatId,
          sessionId: chat.sessionId,
          streamingEntityId: String(f.chatId),
          placeholderMessageId: f.messageId,
          prompt: "take a screenshot",
          model: "claude:sonnet",
          repoId: chat.repoId,
        });
        // Completion drained the queue while the upload ran.
        await ctx.db.insert("messages", {
          parentId: f.chatId,
          role: "user",
          content: "next message",
          timestamp: 2_000,
        });
        const nextReplyId = await ctx.db.insert("messages", {
          parentId: f.chatId,
          role: "assistant",
          content: "",
          timestamp: 2_001,
        });
        return { turnId, nextReplyId };
      });
      await f.t
        .withIdentity({ subject: CLERK_ID })
        .action(api.screenshots.attachMedia, {
          parentId: f.chatId,
          turnId,
          mediaStorageIds: [f.storageId],
        });
      expect(await f.readMedia()).toEqual([f.storageId]);
      const nextReply = await f.t.run((ctx) => ctx.db.get(nextReplyId));
      expect(nextReply?.mediaStorageIds).toBeUndefined();
    },
    TIMEOUT_MS,
  );

  test(
    "refuses a caller without access to the chat's repo",
    async () => {
      const f = await fixture();
      await expect(
        f.t
          .withIdentity({ subject: STRANGER })
          .action(api.screenshots.attachMedia, {
            parentId: f.chatId,
            messageId: f.messageId,
            mediaStorageIds: [f.storageId],
          }),
      ).rejects.toThrow("Not authorized");
      expect(await f.readMedia()).toBeUndefined();
    },
    TIMEOUT_MS,
  );
});
