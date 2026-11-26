import { convexTest } from "convex-test";
import workflow from "@convex-dev/workflow/test";
import { afterEach, beforeEach, describe, expect, mock, test, vi } from "bun:test";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { DEFAULT_AI_MODEL } from "../convex/validators";
import { EVA_MENTION_ID } from "@eva/shared";
import { modules } from "./_helpers/convexModules";

/**
 * Reply-thread participants (plan `notifications-v2-5.md`, part A): who is in
 * a thread, who a reply notifies, Eva's answer to the person who asked, and
 * reading a thread.
 */

// convex-test ids look like `10000;users`, which the real token pattern never
// matches. This reads any `@[Name](id)` token, as `coordinatorChatRouting`.
mock.module("../convex/_mentions/extractMentionedUserIds", () => ({
  extractMentionedUserIds: (
    ctx: { db: { normalizeId: (table: "users", id: string) => Id<"users"> | null } },
    content: string,
  ) => {
    const ids: Id<"users">[] = [];
    for (const match of content.matchAll(/@\[[^\]]+\]\(([^)]+)\)/g)) {
      const userId = ctx.db.normalizeId("users", match[1] ?? "");
      if (userId && !ids.includes(userId)) ids.push(userId);
    }
    return ids;
  },
}));

const TIMEOUT_MS = 30_000;
type Name = "Ana" | "Ben" | "Cat" | "Dan" | "Eve" | "Fay";
const NAMES: readonly Name[] = ["Ana", "Ben", "Cat", "Dan", "Eve", "Fay"];
const EVA = `@[Eva](${EVA_MENTION_ID})`;

// Started workflows must not run their steps after the test.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
});

async function fixture() {
  const t = convexTest(schema, modules);
  workflow.register(t);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const user = (name: Name) =>
      ctx.db.insert("users", { clerkId: `clerk|${name}`, fullName: name });
    const users: Record<Name, Id<"users">> = {
      Ana: await user("Ana"),
      Ben: await user("Ben"),
      Cat: await user("Cat"),
      Dan: await user("Dan"),
      Eve: await user("Eve"),
      Fay: await user("Fay"),
    };
    const teamId = await ctx.db.insert("teams", {
      name: "Eva",
      createdBy: users.Ana,
      createdAt: now,
    });
    for (const name of NAMES) {
      await ctx.db.insert("teamMembers", {
        teamId,
        userId: users[name],
        role: "member",
        joinedAt: now,
      });
    }
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: users.Ana,
      teamId,
    });
    const projectId = await ctx.db.insert("projects", {
      repoId,
      userId: users.Ana,
      title: "Checkout",
      rawInput: "Checkout",
      numId: 1,
    });
    return { users, projectId };
  });
  const as = (name: Name) => t.withIdentity({ subject: `clerk|${name}` });
  const { chatId } = await as("Ana").mutation(api.sessions.ensureOwned, {
    owner: { kind: "project", projectId: ids.projectId },
  });
  return { t, as, chatId, ...ids };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

const mention = (f: Fixture, name: Name) => `@[${name}](${f.users[name]})`;

/** A person's message in the main chat, stored directly (no turn). */
function postRoot(f: Fixture, name: Name, content: string) {
  return f.t.run((ctx) =>
    ctx.db.insert("messages", {
      parentId: f.chatId,
      role: "user",
      content,
      timestamp: Date.now(),
      userId: f.users[name],
    }),
  );
}

function reply(f: Fixture, name: Name, rootId: Id<"messages">, content: string) {
  return f.as(name).mutation(api.sessionWorkflow.addReply, {
    rootId,
    content,
    model: DEFAULT_AI_MODEL,
  });
}

function participants(f: Fixture, rootId: Id<"messages">) {
  return f.t.run(async (ctx) => {
    const rows = await ctx.db
      .query("threadParticipants")
      .withIndex("by_root", (q) => q.eq("rootId", rootId))
      .collect();
    const byName = new Map(
      NAMES.map((name): [string, Name] => [String(f.users[name]), name]),
    );
    return Object.fromEntries(
      rows.map((row) => [byName.get(String(row.userId)), row.following]),
    );
  });
}

/** A person's notifications: type, title, thread and read, oldest first. */
function inbox(f: Fixture, name: Name) {
  return f.t.run(async (ctx) =>
    (
      await ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", f.users[name]))
        .collect()
    ).map((row) => ({
      type: row.type,
      title: row.title,
      threadRootId: row.threadRootId,
      read: row.read,
    })),
  );
}

describe("thread participants", () => {
  test(
    "the root's author, repliers and everyone mentioned in the root or a reply join",
    async () => {
      const f = await fixture();
      const rootId = await postRoot(f, "Ana", `${mention(f, "Fay")} promo box?`);
      await reply(f, "Ben", rootId, `${mention(f, "Cat")} is this SAVE10?`);
      expect(await participants(f, rootId)).toEqual({
        Ben: true,
        Ana: true,
        Fay: true,
        Cat: true,
      });
    },
    TIMEOUT_MS,
  );

  test(
    "a reply reaches every follower (not only 3), skips the unfollowed, and a mention stays a mention",
    async () => {
      const f = await fixture();
      const rootId = await postRoot(f, "Ana", "Promo code box is hard to find.");
      const repliers: Name[] = ["Ben", "Cat", "Dan", "Eve"];
      for (const name of repliers) {
        await reply(f, name, rootId, `Seen it, ${name}`);
      }
      await f.as("Dan").mutation(api.threads.setFollowing, {
        rootId,
        following: false,
      });
      // Dan posts again: his unfollow stays.
      await reply(f, "Dan", rootId, "One more thing");
      expect((await participants(f, rootId)).Dan).toBe(false);

      await reply(f, "Fay", rootId, `${mention(f, "Cat")} same on iPad`);

      const fromFay = async (name: Name) =>
        (await inbox(f, name)).filter((row) => row.title.startsWith("Fay"));
      const followers: Name[] = ["Ana", "Ben", "Eve"];
      for (const name of followers) {
        expect(await fromFay(name)).toEqual([
          {
            type: "thread_reply",
            title: "Fay replied in a thread",
            threadRootId: rootId,
            read: false,
          },
        ]);
      }
      expect(await fromFay("Cat")).toEqual([
        {
          type: "mention",
          title: "Fay mentioned you in a thread",
          threadRootId: rootId,
          read: false,
        },
      ]);
      expect(await fromFay("Dan")).toEqual([]);
      // Ana, the root's author, heard of every reply.
      expect(
        (await inbox(f, "Ana")).filter((row) => row.type === "thread_reply"),
      ).toHaveLength(6);
    },
    TIMEOUT_MS,
  );

  test(
    "Eva's answer in a thread notifies the person who asked her",
    async () => {
      const f = await fixture();
      // A running sandbox: the @Eva reply opens her turn at once.
      await f.t.run(async (ctx) => {
        const chat = await ctx.db.get(f.chatId);
        if (!chat) throw new Error("chat missing");
        await ctx.db.patch(chat.sessionId, {
          sandboxId: "sbx_threads",
          status: "active",
        });
      });
      const rootId = await postRoot(f, "Ana", "What is left in phase 1?");
      await reply(f, "Ben", rootId, `${EVA} what is left?`);
      const turn = await f.t.run((ctx) => ctx.db.query("turns").first());
      if (!turn) throw new Error("Eva's turn did not open");
      expect(turn.askedBy).toBe(f.users.Ben);

      await f.t.mutation(internal.sessionWorkflow.saveResult, {
        chatId: f.chatId,
        turnId: turn._id,
        success: true,
        result: "Phase 1 has two open items.",
        error: null,
        activityLog: null,
      });

      expect(
        (await inbox(f, "Ben")).filter((row) => row.type === "thread_answer"),
      ).toEqual([
        {
          type: "thread_answer",
          title: "Eva answered your question in a thread",
          threadRootId: rootId,
          read: false,
        },
      ]);
      // Ana follows the thread but did not ask: Eva's answer is not hers.
      expect(
        (await inbox(f, "Ana")).filter((row) => row.type === "thread_answer"),
      ).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    "unread replies count others' replies since the last read",
    async () => {
      const f = await fixture();
      const rootId = await postRoot(f, "Ana", "Promo code box.");
      const readState = () =>
        f.as("Ana").query(api.threads.readState, { rootId });
      await reply(f, "Ben", rootId, "Same on iPad");
      await reply(f, "Cat", rootId, "And Android");
      expect((await readState())?.unread).toBe(2);

      // Her own reply reads the thread and is not new to her.
      await reply(f, "Ana", rootId, "Thanks both");
      expect((await readState())?.unread).toBe(0);

      await reply(f, "Ben", rootId, "Fixed in #904");
      expect((await readState())?.unread).toBe(1);

      // Not following: no "N new".
      await f.as("Ana").mutation(api.threads.setFollowing, {
        rootId,
        following: false,
      });
      expect(await readState()).toMatchObject({ following: false, unread: 0 });
      // Never in the thread: no state.
      expect(
        await f.as("Eve").query(api.threads.readState, { rootId }),
      ).toBeNull();
    },
    TIMEOUT_MS,
  );

  test(
    "opening a thread reads it and its notifications only; posting answers mentions where you post",
    async () => {
      const f = await fixture();
      const first = await postRoot(f, "Ana", "First thread");
      const second = await postRoot(f, "Ana", "Second thread");
      await reply(f, "Ben", first, "A reply");
      await reply(f, "Ben", second, `${mention(f, "Ana")} a question`);
      // A mention of Ana in the main chat.
      await f.as("Ben").mutation(api.chats.send, {
        target: f.chatId,
        message: `${mention(f, "Ana")} main chat`,
      });
      const unread = async () =>
        (await inbox(f, "Ana"))
          .filter((row) => !row.read)
          .map((row) => [row.type, row.threadRootId ?? "main"]);
      expect(await unread()).toEqual([
        ["thread_reply", first],
        ["mention", second],
        ["mention", "main"],
      ]);

      await f.as("Ana").mutation(api.threads.markRead, { rootId: first });
      expect(await unread()).toEqual([
        ["mention", second],
        ["mention", "main"],
      ]);
      expect(
        (await f.as("Ana").query(api.threads.readState, { rootId: first }))
          ?.unread,
      ).toBe(0);

      // Posting in the second thread answers its mention, not the main chat's.
      await reply(f, "Ana", second, "On it");
      expect(await unread()).toEqual([["mention", "main"]]);

      // Posting in the main chat answers the main chat's.
      await f.as("Ana").mutation(api.chats.send, {
        target: f.chatId,
        message: `${mention(f, "Ben")} done`,
      });
      expect(await unread()).toEqual([]);
    },
    TIMEOUT_MS,
  );
});
