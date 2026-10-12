import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import type { Id } from "../convex/_generated/dataModel";
import { ensureMainChat } from "../convex/_sessionChats/helpers";

/**
 * Chat-scoped rows hang off the sessionChats id since sessions hold several
 * chats. Rows written before that sit on the session id: they must move onto
 * the Main chat, a read of a chat must clear the session's sidebar dot, and
 * deleting a repo must take every chat's rows with it.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|session-chat-legacy-rows";

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const otherId = await ctx.db.insert("users", { clerkId: "clerk|other" });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const sessionId = await ctx.db.insert("sessions", {
      repoId,
      userId,
      title: "Legacy rows",
      status: "active",
      numId: 1,
    });
    return { userId, otherId, repoId, sessionId };
  });
  return { t, asUser: t.withIdentity({ subject: CLERK_ID }), ...ids };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

/** One of each chat-scoped row on `parentId`, plus a chat-less draft per user. */
async function seedChatRows(
  f: Fixture,
  parentId: Id<"sessions"> | Id<"sessionChats">,
) {
  await f.t.run(async (ctx) => {
    await ctx.db.insert("messages", {
      parentId,
      role: "user",
      content: "Hello",
      timestamp: 1,
    });
    await ctx.db.insert("queuedMessages", {
      parentId,
      content: "next",
      createdAt: 1,
      order: 1,
      userId: f.userId,
    });
    await ctx.db.insert("chatUiPanels", {
      parentId,
      prompt: "a table",
      spec: "{}",
      elementCount: 0,
      createdAt: 1,
    });
    const bodyId = await ctx.db.insert("chatHtmlRenderBodies", {
      html: "<p>hi</p>",
    });
    await ctx.db.insert("chatHtmlRenders", {
      parentId,
      title: "Page",
      height: 100,
      bodyId,
      createdAt: 1,
    });
    await ctx.db.insert("envVarRequests", {
      parentId,
      key: "API_KEY",
      reason: "needed",
      scope: "repo",
      repoId: f.repoId,
      status: "pending",
      createdAt: 1,
    });
  });
}

async function seedLegacyDrafts(f: Fixture) {
  await f.t.run(async (ctx) => {
    for (const userId of [f.userId, f.otherId]) {
      await ctx.db.insert("drafts", {
        userId,
        repoId: f.repoId,
        kind: "sessionChat",
        sessionId: f.sessionId,
        content: "half a thought",
        updatedAt: 1,
      });
    }
  });
}

async function rowsOn(f: Fixture, parentId: Id<"sessions"> | Id<"sessionChats">) {
  return f.t.run(async (ctx) => {
    const count = async (
      table: "chatUiPanels" | "chatHtmlRenders" | "envVarRequests" | "messages",
    ) =>
      (
        await ctx.db
          .query(table)
          .withIndex("by_parent", (q) => q.eq("parentId", parentId))
          .collect()
      ).length;
    const queued = await ctx.db
      .query("queuedMessages")
      .withIndex("by_parent_and_order", (q) => q.eq("parentId", parentId))
      .collect();
    return {
      messages: await count("messages"),
      queued: queued.length,
      panels: await count("chatUiPanels"),
      renders: await count("chatHtmlRenders"),
      envRequests: await count("envVarRequests"),
    };
  });
}

const NONE = { messages: 0, queued: 0, panels: 0, renders: 0, envRequests: 0 };
const ONE_EACH = { messages: 1, queued: 1, panels: 1, renders: 1, envRequests: 1 };

afterEach(() => {
  vi.useRealTimers();
});

describe("legacy session rows move onto the Main chat", () => {
  test(
    "ensureMainChat moves cards and the owner's draft, not only messages",
    async () => {
      const f = await fixture();
      await seedChatRows(f, f.sessionId);
      await seedLegacyDrafts(f);

      const chat = await f.t.run(async (ctx) => {
        const session = await ctx.db.get(f.sessionId);
        if (!session) throw new Error("no session");
        return ensureMainChat(ctx, session);
      });

      expect(await rowsOn(f, f.sessionId)).toEqual(NONE);
      expect(await rowsOn(f, chat._id)).toEqual(ONE_EACH);
      const ownerDraft = await f.t.run((ctx) =>
        ctx.db
          .query("drafts")
          .withIndex("by_user_and_chat", (q) =>
            q.eq("userId", f.userId).eq("chatId", chat._id),
          )
          .unique(),
      );
      expect(ownerDraft?.content).toBe("half a thought");
    },
    TIMEOUT_MS,
  );

  test(
    "a long transcript moves in scheduled batches",
    async () => {
      vi.useFakeTimers();
      const f = await fixture();
      await f.t.run(async (ctx) => {
        for (let i = 0; i < 450; i++) {
          await ctx.db.insert("messages", {
            parentId: f.sessionId,
            role: "user",
            content: `m${i}`,
            timestamp: i,
          });
        }
      });

      const chat = await f.t.run(async (ctx) => {
        const session = await ctx.db.get(f.sessionId);
        if (!session) throw new Error("no session");
        return ensureMainChat(ctx, session);
      });
      // The first mutation moves one bounded batch only.
      expect((await rowsOn(f, f.sessionId)).messages).toBeGreaterThan(0);

      await f.t.finishAllScheduledFunctions(vi.runAllTimers);
      expect((await rowsOn(f, f.sessionId)).messages).toBe(0);
      expect((await rowsOn(f, chat._id)).messages).toBe(450);
    },
    TIMEOUT_MS,
  );

  test(
    "the migration moves rows and every user's draft for backfilled sessions",
    async () => {
      vi.useFakeTimers();
      const f = await fixture();
      // Backfilled before the fix: Main chat exists, cards stayed behind.
      const chatId = await f.t.run((ctx) =>
        ctx.db.insert("sessionChats", {
          sessionId: f.sessionId,
          repoId: f.repoId,
          userId: f.userId,
          title: "Main",
          number: 1,
          isMain: true,
        }),
      );
      await seedChatRows(f, f.sessionId);
      await seedLegacyDrafts(f);

      await f.t.mutation(
        internal._migrations.moveLegacyChatRows.moveLegacyChatRows,
        {},
      );
      await f.t.finishAllScheduledFunctions(vi.runAllTimers);

      expect(await rowsOn(f, f.sessionId)).toEqual(NONE);
      expect(await rowsOn(f, chatId)).toEqual(ONE_EACH);
      const drafts = await f.t.run((ctx) => ctx.db.query("drafts").collect());
      expect(drafts.map((d) => d.chatId)).toEqual([chatId, chatId]);
    },
    TIMEOUT_MS,
  );
});

describe("reading a session chat clears the sidebar dot", () => {
  test(
    "markRead on a chat also reads its session",
    async () => {
      const f = await fixture();
      const chatId = await f.t.run(async (ctx) => {
        await ctx.db.patch(f.sessionId, { lastTurnFinishedAt: 100 });
        return ctx.db.insert("sessionChats", {
          sessionId: f.sessionId,
          repoId: f.repoId,
          userId: f.userId,
          title: "Main",
          number: 1,
          isMain: true,
          lastTurnFinishedAt: 100,
        });
      });
      const unreadInSidebar = async () =>
        (await f.asUser.query(api.sessions.list, { repoId: f.repoId })).find(
          (item) => item._id === f.sessionId,
        )?.hasUnread;

      expect(await unreadInSidebar()).toBe(true);
      await f.asUser.mutation(api.chatReads.markRead, { parentId: chatId });
      expect(await unreadInSidebar()).toBe(false);
    },
    TIMEOUT_MS,
  );
});

describe("repo deletion", () => {
  test(
    "deletes every chat's rows, drafts and the chats themselves",
    async () => {
      // Keeps the scheduled next step from running mid-assertion.
      vi.useFakeTimers();
      const f = await fixture();
      const chatIds = await f.t.run(async (ctx) => [
        await ctx.db.insert("sessionChats", {
          sessionId: f.sessionId,
          repoId: f.repoId,
          userId: f.userId,
          title: "Main",
          number: 1,
          isMain: true,
        }),
        await ctx.db.insert("sessionChats", {
          sessionId: f.sessionId,
          repoId: f.repoId,
          userId: f.userId,
          title: "Chat 2",
          number: 2,
          isMain: false,
          createdBy: f.otherId,
        }),
      ]);
      for (const chatId of chatIds) await seedChatRows(f, chatId);
      await seedLegacyDrafts(f);

      await f.t.mutation(internal.migrations.deleteRepoStep, {
        repoId: f.repoId,
        step: "sessions",
        totalDeleted: 0,
        repoLabel: "vvedantb/eva",
      });

      for (const chatId of chatIds) {
        expect(await rowsOn(f, chatId)).toEqual(NONE);
      }
      const left = await f.t.run(async (ctx) => ({
        chats: await ctx.db.query("sessionChats").collect(),
        drafts: await ctx.db.query("drafts").collect(),
        bodies: await ctx.db.query("chatHtmlRenderBodies").collect(),
      }));
      expect(left).toEqual({ chats: [], drafts: [], bodies: [] });
    },
    TIMEOUT_MS,
  );
});
