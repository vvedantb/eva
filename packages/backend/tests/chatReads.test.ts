import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { computeHasUnread, isOwnChat } from "../convex/chatReads";
import schema from "../convex/schema";

/**
 * The unread rule shared by the three chat list queries and `isUnread`. Only
 * "my" chats light up: owner, creator, project member, or a chat the user has
 * opened before (a read row exists). Teammates' chats stay quiet otherwise.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;

/** Real ids keep the tests cast-free; nothing else touches the database. */
async function twoUsers() {
  const t = convexTest(schema, modules);
  return t.run(async (ctx) => ({
    me: await ctx.db.insert("users", { clerkId: "clerk|chat-reads-me" }),
    other: await ctx.db.insert("users", { clerkId: "clerk|chat-reads-other" }),
  }));
}

describe("isOwnChat", () => {
  test(
    "owner, creator and project member count; a teammate's chat does not",
    async () => {
      const { me, other } = await twoUsers();
      expect(isOwnChat(me, { userId: me })).toBe(true);
      expect(isOwnChat(me, { userId: other, createdBy: me })).toBe(true);
      expect(isOwnChat(me, { createdBy: me })).toBe(true);
      expect(isOwnChat(me, { userId: other, members: [other, me] })).toBe(
        true,
      );
      expect(isOwnChat(me, { userId: other, members: [other] })).toBe(false);
      expect(isOwnChat(me, { createdBy: other })).toBe(false);
      expect(isOwnChat(me, {})).toBe(false);
    },
    TIMEOUT_MS,
  );
});

describe("computeHasUnread", () => {
  const base = {
    isOwn: true,
    hasReadRow: false,
    lastTurnFinishedAt: 200,
    lastReadAt: undefined,
  };

  test("own chat with a finished turn and no read row is unread", () => {
    expect(computeHasUnread(base)).toBe(true);
  });

  test("a chat that never finished a turn is never unread (no backfill)", () => {
    expect(computeHasUnread({ ...base, lastTurnFinishedAt: undefined })).toBe(
      false,
    );
  });

  test("reading at or after the turn end clears it; a later turn relights it", () => {
    expect(
      computeHasUnread({ ...base, hasReadRow: true, lastReadAt: 200 }),
    ).toBe(false);
    expect(
      computeHasUnread({ ...base, hasReadRow: true, lastReadAt: 300 }),
    ).toBe(false);
    expect(
      computeHasUnread({ ...base, hasReadRow: true, lastReadAt: 100 }),
    ).toBe(true);
  });

  test("a teammate's chat stays quiet until the user opens it once", () => {
    expect(computeHasUnread({ ...base, isOwn: false })).toBe(false);
    expect(
      computeHasUnread({
        ...base,
        isOwn: false,
        hasReadRow: true,
        lastReadAt: 100,
      }),
    ).toBe(true);
  });
});
