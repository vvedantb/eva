import { convexTest } from "convex-test";
import workflow from "@convex-dev/workflow/test";
import { afterEach, beforeEach, describe, expect, mock, test, vi } from "bun:test";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { DEFAULT_AI_MODEL } from "../convex/validators";
import { chatMessageRoute, EVA_MENTION_ID, mentionsEva } from "@eva/shared";
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
const AUTHOR = "clerk|routing-author";
const TEAMMATE = "clerk|routing-teammate";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("chatMessageRoute", () => {
  test("only teammates mentioned is quiet; anything else wakes Eva", () => {
    expect(chatMessageRoute({ mentionsEva: false, mentionedPeople: 0 })).toBe(
      "wake",
    );
    expect(chatMessageRoute({ mentionsEva: false, mentionedPeople: 2 })).toBe(
      "quiet",
    );
    expect(chatMessageRoute({ mentionsEva: true, mentionedPeople: 1 })).toBe(
      "wake",
    );
    expect(mentionsEva(`hi @[Eva](${EVA_MENTION_ID})`)).toBe(true);
    expect(mentionsEva("hi Eva")).toBe(false);
  });
});

async function fixture() {
  const t = convexTest(schema, modules);
  workflow.register(t);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const authorId = await ctx.db.insert("users", {
      clerkId: AUTHOR,
      fullName: "Ana Author",
    });
    const teammateId = await ctx.db.insert("users", {
      clerkId: TEAMMATE,
      fullName: "Tom Mate",
    });
    const teamId = await ctx.db.insert("teams", {
      name: "Eva",
      createdBy: authorId,
      createdAt: now,
    });
    for (const userId of [authorId, teammateId]) {
      await ctx.db.insert("teamMembers", {
        teamId,
        userId,
        role: "member",
        joinedAt: now,
      });
    }
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: authorId,
      teamId,
    });
    const projectId = await ctx.db.insert("projects", {
      repoId,
      userId: authorId,
      title: "Checkout",
      rawInput: "Checkout",
      numId: 1,
    });
    return { authorId, teammateId, repoId, projectId };
  });
  const author = t.withIdentity({ subject: AUTHOR });
  const teammate = t.withIdentity({ subject: TEAMMATE });
  const { chatId } = await author.mutation(api.sessions.ensureOwned, {
    owner: { kind: "project", projectId: ids.projectId },
  });
  return { t, author, teammate, chatId, ...ids };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function send(
  f: Fixture,
  who: Fixture["author"],
  message: string,
) {
  await who.mutation(api.sessions.addMessage, {
    chatId: f.chatId,
    role: "user",
    content: message,
  });
  return who.mutation(api.sessionWorkflow.startExecute, {
    chatId: f.chatId,
    message,
    model: DEFAULT_AI_MODEL,
  });
}

const chatState = (f: Fixture) =>
  f.t.run(async (ctx) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", f.chatId))
      .collect();
    const queued = await ctx.db
      .query("queuedMessages")
      .withIndex("by_parent_and_created", (q) => q.eq("parentId", f.chatId))
      .collect();
    const turns = await ctx.db
      .query("turns")
      .withIndex("by_entity_open", (q) => q.eq("entityId", f.chatId))
      .collect();
    return {
      users: messages.filter((m) => m.role === "user").length,
      assistants: messages.filter((m) => m.role === "assistant").length,
      queued: queued.length,
      turns: turns.length,
    };
  });

const mentionToken = (name: string, id: Id<"users">) => `@[${name}](${id})`;

describe("coordinator chat routing", () => {
  test(
    "a message for teammates only is posted quietly: no turn, nothing queued",
    async () => {
      const f = await fixture();
      const result = await send(
        f,
        f.author,
        `${mentionToken("Tom Mate", f.teammateId)} can you check the copy?`,
      );
      expect(result).toBe("posted");
      expect(await chatState(f)).toEqual({
        users: 1,
        assistants: 0,
        queued: 0,
        turns: 0,
      });

      await f.author.mutation(api._sessions.execution.enqueueMessage, {
        chatId: f.chatId,
        message: `${mentionToken("Tom Mate", f.teammateId)} and the colours`,
        model: DEFAULT_AI_MODEL,
      });
      expect(await chatState(f)).toEqual({
        users: 2,
        assistants: 0,
        queued: 0,
        turns: 0,
      });
    },
    TIMEOUT_MS,
  );

  test(
    "no mention, or @Eva with a teammate, still starts Eva's turn",
    async () => {
      const f = await fixture();
      expect(await send(f, f.author, "Plan the checkout work")).toBe("started");
      const g = await fixture();
      expect(
        await send(
          g,
          g.author,
          `@[Eva](${EVA_MENTION_ID}) split this up, ${mentionToken("Tom Mate", g.teammateId)} reviews`,
        ),
      ).toBe("started");
      expect((await chatState(g)).assistants).toBe(1);
    },
    TIMEOUT_MS,
  );
});

describe("mentions in Needs you", () => {
  test(
    "a teammate's mention waits under Questions until they post in that chat",
    async () => {
      const f = await fixture();
      await send(
        f,
        f.author,
        `${mentionToken("Tom Mate", f.teammateId)} can you check the copy?`,
      );
      const before = await f.teammate.query(api.needsYou.list, {});
      const mention = before.find((row) => row.key.startsWith("notification:"));
      expect(mention?.group).toBe("question");
      expect(mention?.source).toBe("project");
      expect(mention?.projectTitle).toBe("Checkout");
      expect(mention?.chatTarget).toBe(f.projectId);
      const authorRows = await f.author.query(api.needsYou.list, {});
      expect(authorRows.some((row) => row.key.startsWith("notification:"))).toBe(
        false,
      );

      await send(
        f,
        f.teammate,
        `${mentionToken("Ana Author", f.authorId)} looks good`,
      );
      const after = await f.teammate.query(api.needsYou.list, {});
      expect(after.some((row) => row.key.startsWith("notification:"))).toBe(false);
    },
    TIMEOUT_MS,
  );
});
