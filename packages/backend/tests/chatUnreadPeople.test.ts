import { convexTest } from "convex-test";
import workflow from "@convex-dev/workflow/test";
import { afterEach, beforeEach, describe, expect, mock, test, vi } from "bun:test";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { DEFAULT_AI_MODEL } from "../convex/validators";
import { hasUnreadByPointRead } from "../convex/chatReads";
import { findNewMessageIds } from "@eva/shared/chatReadState";
import { modules } from "./_helpers/convexModules";

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
type Name = "Ana" | "Ben" | "Cat" | "Dan";
const NAMES: readonly Name[] = ["Ana", "Ben", "Cat", "Dan"];

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
      members: [users.Ana, users.Ben],
      title: "Checkout",
      rawInput: "Checkout",
      numId: 1,
    });
    return { users, projectId };
  });
  const as = (name: Name) => t.withIdentity({ subject: `clerk|${name}` });
  const { sessionId, chatId } = await as("Ana").mutation(
    api.sessions.ensureOwned,
    { owner: { kind: "project", projectId: ids.projectId } },
  );
  await t.run((ctx) =>
    ctx.db.patch(sessionId, { status: "active", sandboxId: "sbx-test" }),
  );
  return { t, as, chatId, ...ids };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

const mention = (f: Fixture, name: Name) => `@[${name}](${f.users[name]})`;

function send(f: Fixture, name: Name, message: string) {
  return f.t.mutation(internal._sessions.execution.sendFromMcp, {
    clerkUserId: `clerk|${name}`,
    chatId: f.chatId,
    message,
    model: DEFAULT_AI_MODEL,
    sentViaOrchestrator: false,
  });
}

async function unread(f: Fixture, name: Name) {
  const chat = await f.as(name).query(api.chatReads.isUnread, {
    parentId: f.chatId,
  });
  const card = await f.t.run(async (ctx) => {
    const project = await ctx.db.get(f.projectId);
    if (!project) throw new Error("project missing");
    return hasUnreadByPointRead(ctx.db, f.users[name], project);
  });
  return { chat: chat.hasUnread, card };
}

const allNotifications = (f: Fixture) =>
  f.t.run((ctx) => ctx.db.query("notifications").collect());

describe("chat unread for people's messages", () => {
  test(
    "a teammate's message lights the chat for another participant, not for its author, and notifies no one",
    async () => {
      const f = await fixture();
      expect(await send(f, "Ben", "The promo box is hard to find.")).toBe(
        "started",
      );
      expect(await unread(f, "Ana")).toEqual({ chat: true, card: true });
      expect(await unread(f, "Ben")).toEqual({ chat: false, card: false });
      expect(await unread(f, "Cat")).toEqual({ chat: false, card: false });
      expect(await allNotifications(f)).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    "a thread reply does not light the chat",
    async () => {
      const f = await fixture();
      const rootId = await f.t.run((ctx) =>
        ctx.db.insert("messages", {
          parentId: f.chatId,
          role: "user",
          content: "What is left in phase 1?",
          timestamp: Date.now(),
          userId: f.users.Ana,
        }),
      );
      await f.as("Ana").mutation(api.chatReads.markRead, { parentId: f.chatId });
      await f.as("Ben").mutation(api.sessionWorkflow.addReply, {
        rootId,
        content: "Two open items.",
        model: DEFAULT_AI_MODEL,
      });
      expect(await unread(f, "Ana")).toEqual({ chat: false, card: false });
    },
    TIMEOUT_MS,
  );

  test(
    "a quiet comment in a coordinator chat lights the dot for its participants, with the NEW line on it",
    async () => {
      const f = await fixture();
      await f.t.run(async (ctx) => {
        const chat = await ctx.db.get(f.chatId);
        if (!chat) throw new Error("chat missing");
        await ctx.db.insert("chatReads", {
          userId: f.users.Ben,
          parentId: f.chatId,
          repoId: chat.repoId,
          lastReadAt: Date.now() - 60_000,
        });
      });
      const content = `${mention(f, "Dan")} can you check the copy?`;
      expect(await send(f, "Ana", content)).toBe("posted");

      expect(await unread(f, "Ana")).toEqual({ chat: false, card: false });
      expect(await unread(f, "Ben")).toEqual({ chat: true, card: true });
      expect(await unread(f, "Dan")).toEqual({ chat: true, card: true });
      expect(await unread(f, "Cat")).toEqual({ chat: false, card: false });

      const { lastReadAt } = await f.as("Dan").query(api.chatReads.isUnread, {
        parentId: f.chatId,
      });
      const messages = await f.t.run((ctx) =>
        ctx.db
          .query("messages")
          .withIndex("by_parent", (q) => q.eq("parentId", f.chatId))
          .collect(),
      );
      const commentId = messages.find((m) => m.content === content)?._id;
      expect(commentId).toBeDefined();
      expect(
        findNewMessageIds(messages, lastReadAt, String(f.users.Dan)),
      ).toEqual(commentId ? [commentId] : []);
    },
    TIMEOUT_MS,
  );
});
