import { convexTest } from "convex-test";
import { describe, expect, test } from "bun:test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { inboxChatRefFromHref, mergeInboxRows } from "@eva/shared/inbox";
import { modules } from "./_helpers/convexModules";

/**
 * The Inbox: the shared rule that keeps one row for each chat in its most
 * urgent group, and `inbox.list` over real rows (who "took part" in a chat,
 * Done hiding a chat until something newer happens in it, and Done reading
 * the notification a row holds).
 */

const CLERK_ID = "clerk|inbox";
const OTHER_CLERK_ID = "clerk|inbox-other";
/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;

describe("mergeInboxRows", () => {
  test("one row for each chat, in its most urgent group, chats before alerts", () => {
    const merged = mergeInboxRows([
      { key: "task-a", group: "new" as const, kind: "chat" as const, at: 9 },
      { key: "task-a", group: "holding" as const, kind: "chat" as const, at: 1 },
      { key: "task-b", group: "new" as const, kind: "alert" as const, at: 8 },
      { key: "task-b", group: "new" as const, kind: "chat" as const, at: 2 },
      { key: "task-c", group: "waiting" as const, kind: "chat" as const, at: 5 },
      { key: "note-d", group: "new" as const, kind: "alert" as const, at: 7 },
    ]);
    expect(merged.map((row) => [row.key, row.group, row.kind])).toEqual([
      ["task-a", "holding", "chat"],
      ["task-c", "waiting", "chat"],
      // Newest first inside a group.
      ["note-d", "new", "alert"],
      ["task-b", "new", "chat"],
    ]);
  });
});

describe("notifications fold into their chat's row", () => {
  test("a link names its chat, and the chat row takes the newer notification's line", () => {
    const base = "/vvedantb/eva/web";
    expect(inboxChatRefFromHref(`${base}/quick-tasks/450`)).toEqual({ kind: "task", numId: 450 });
    expect(inboxChatRefFromHref(`${base}/projects/7/902/activity`)).toEqual({ kind: "task", numId: 902 });
    expect(inboxChatRefFromHref(`${base}/projects/7?tasks=906&task=906`)).toEqual({ kind: "task", numId: 906 });
    expect(inboxChatRefFromHref(`${base}/projects/7/sandbox/replies?thread=x`)).toEqual({ kind: "project", numId: 7 });
    expect(inboxChatRefFromHref("/vvedantb/eva/sessions/412")).toEqual({ kind: "session", numId: 412 });
    expect(inboxChatRefFromHref(`${base}/docs/3`)).toBeUndefined();

    const [row] = mergeInboxRows([
      { key: "task-450", group: "new" as const, kind: "chat" as const, at: 1, preview: "Ran the tests" },
      { key: "task-450", group: "new" as const, kind: "alert" as const, at: 5, preview: "PR merged · moved to done" },
    ]);
    expect(row).toMatchObject({ kind: "chat", at: 5, preview: "PR merged · moved to done" });
  });
});

describe("inbox.list", () => {
  test(
    "lists chats the caller took part in, and Done hides one until newer activity",
    async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
        const otherUserId = await ctx.db.insert("users", { clerkId: OTHER_CLERK_ID });
        const repoId = await ctx.db.insert("githubRepos", {
          owner: "vvedantb",
          name: "eva",
          installationId: 1,
          connectedBy: userId,
        });
        // Someone else's project the caller is only a member of: Eva replied
        // after the caller last read it, but membership alone is not taking part.
        const projectId = await ctx.db.insert("projects", {
          repoId,
          userId: otherUserId,
          members: [userId],
          title: "Checkout",
          rawInput: "Checkout",
          numId: 1,
          lastTurnFinishedAt: 50,
        });
        const taskId = await ctx.db.insert("agentTasks", {
          repoId,
          title: "Fix login test",
          status: "todo",
          numId: 2,
          createdBy: userId,
          createdAt: 0,
          updatedAt: 0,
          lastTurnFinishedAt: 50,
        });
        const read = { userId, repoId, lastReadAt: 10 };
        await ctx.db.insert("chatReads", { ...read, parentId: projectId });
        await ctx.db.insert("chatReads", { ...read, parentId: taskId });
        return { userId, taskId, projectId };
      });
      const asUser = t.withIdentity({ subject: CLERK_ID });
      const listed = async () =>
        (await asUser.query(api.inbox.list, {})).map((row) => [row.title, row.group]);

      // The caller made the quick task, so its new reply shows; the project does not.
      expect(await listed()).toEqual([["Fix login test", "new"]]);

      // Posting in the project makes the caller part of it.
      await t.run(async (ctx) => {
        const row = await ctx.db
          .query("chatReads")
          .withIndex("by_user_parent", (q) =>
            q.eq("userId", ids.userId).eq("parentId", ids.projectId),
          )
          .unique();
        if (row) await ctx.db.patch(row._id, { joinedAt: 20 });
      });
      expect((await listed()).map(([title]) => title).sort()).toEqual([
        "Checkout",
        "Fix login test",
      ]);

      // Done hides the task; Undo brings it back; new activity after Done does too.
      const { previousDoneAt } = await asUser.mutation(api.inbox.markDone, {
        chatId: ids.taskId,
      });
      expect((await listed()).map(([title]) => title)).toEqual(["Checkout"]);
      await asUser.mutation(api.inbox.undoDone, { chatId: ids.taskId, previousDoneAt });
      expect((await listed()).map(([title]) => title)).toContain("Fix login test");
      await asUser.mutation(api.inbox.markDone, { chatId: ids.taskId });
      await t.run((ctx) =>
        ctx.db.patch(ids.taskId, { lastTurnFinishedAt: Date.now() + 1_000 }),
      );
      expect((await listed()).map(([title]) => title)).toContain("Fix login test");

      // Done on a row that holds a notification reads it; Undo makes it unread again.
      const notificationId = await t.run((ctx) =>
        ctx.db.insert("notifications", {
          userId: ids.userId,
          type: "task_complete",
          title: "Quick task completed: Fix login test",
          read: false,
          createdAt: Date.now(),
          chatTarget: String(ids.taskId),
        }),
      );
      const isRead = () => t.run(async (ctx) => (await ctx.db.get(notificationId))?.read);
      const undo = await asUser.mutation(api.inbox.markDone, {
        chatId: ids.taskId,
        notificationId,
      });
      expect(await isRead()).toBe(true);
      await asUser.mutation(api.inbox.undoDone, { chatId: ids.taskId, ...undo });
      expect(await isRead()).toBe(false);
    },
    TIMEOUT_MS,
  );
});
