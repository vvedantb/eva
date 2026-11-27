import { convexTest } from "convex-test";
import { describe, expect, test } from "bun:test";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { modules } from "./_helpers/convexModules";

/**
 * One chat per session: the migration's purge deletes a chat a session opened
 * beside its Main chat, with its transcript and the rows keyed by it, keeps
 * Main, and leaves a chat with an open turn for a later rerun.
 */

/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: "clerk|extra-chats" });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "extra-chats-test",
      installationId: 1,
      connectedBy: userId,
    });
    const sessionId = await ctx.db.insert("sessions", {
      owner: { kind: "standalone" },
      repoId,
      userId,
      title: "Provider homepage",
      status: "closed",
    });
    const chat = (number: number, isMain: boolean) =>
      ctx.db.insert("sessionChats", {
        sessionId,
        repoId,
        userId,
        title: isMain ? "Main" : `Chat ${number}`,
        number,
        isMain,
      });
    const mainChatId = await chat(1, true);
    const extraChatId = await chat(2, false);
    const busyChatId = await chat(3, false);
    const messageId = await ctx.db.insert("messages", {
      role: "user",
      content: "Side question",
      timestamp: 1,
      parentId: extraChatId,
    });
    await ctx.db.insert("threadParticipants", {
      rootId: messageId,
      userId,
      following: true,
    });
    await ctx.db.insert("chatReads", {
      userId,
      parentId: extraChatId,
      repoId,
      lastReadAt: 1,
    });
    const docId = await ctx.db.insert("docs", {
      repoId,
      title: "Notes",
      content: "",
      createdAt: 0,
      updatedAt: 0,
      chatParentId: extraChatId,
    });
    await ctx.db.insert("turns", {
      entityId: busyChatId,
      sessionId,
      streamingEntityId: String(busyChatId),
      state: "running",
      open: true,
      turnStartedAt: Date.now(),
      leaseExpiresAt: Date.now() + 60_000,
      leaseGeneration: 1,
      model: "claude:sonnet",
      repoId,
    });
    return { mainChatId, extraChatId, busyChatId, messageId, docId };
  });
  return { t, ...ids };
}

describe("deleteExtraSessionChats", () => {
  test(
    "deletes an extra chat and its rows, keeps Main, moves doc anchors to Main, skips a running chat",
    async () => {
      const f = await fixture();
      const purge =
        internal._migrations.deleteExtraSessionChats.purgeExtraSessionChat;
      await f.t.mutation(purge, { chatId: f.extraChatId });
      await f.t.mutation(purge, { chatId: f.busyChatId });
      await f.t.mutation(purge, { chatId: f.mainChatId });

      const after = await f.t.run(async (ctx) => ({
        main: await ctx.db.get(f.mainChatId),
        extra: await ctx.db.get(f.extraChatId),
        busy: await ctx.db.get(f.busyChatId),
        message: await ctx.db.get(f.messageId),
        participants: await ctx.db.query("threadParticipants").collect(),
        reads: await ctx.db.query("chatReads").collect(),
        doc: await ctx.db.get(f.docId),
      }));
      expect(after.main).not.toBeNull();
      expect(after.extra).toBeNull();
      expect(after.busy).not.toBeNull();
      expect(after.message).toBeNull();
      expect(after.participants).toEqual([]);
      expect(after.reads).toEqual([]);
      expect(after.doc?.chatParentId).toBe(f.mainChatId);
    },
    TIMEOUT_MS,
  );
});
