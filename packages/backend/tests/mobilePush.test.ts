import { convexTest } from "convex-test";
import { defineTable } from "convex/server";
import { v } from "convex/values";
import { pushTokensFields, pushTokensTable } from "@vvedantb/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { createNotification } from "../convex/notifications";

/**
 * Mobile push (apps/mobile): which events reach the phone, and that the push
 * carries the chat the app should open. Pushes are scheduled `push.send`
 * actions, so the tests read the scheduler queue instead of calling Expo.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|mobile-push";
const TOKEN = "ExponentPushToken[test-device]";

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      clerkId: CLERK_ID,
      email: "ada@example.com",
      fullName: "Ada Lovelace",
    });
    const teamId = await ctx.db.insert("teams", { name: "Eva", createdBy: userId, createdAt: now });
    await ctx.db.insert("teamMembers", { teamId, userId, role: "member", joinedAt: now });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const sessionId = await ctx.db.insert("sessions", {
      repoId,
      userId,
      title: "Fix the login bug",
      status: "active",
      numId: 42,
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
  return { t, ids, asUser: t.withIdentity({ subject: CLERK_ID }) };
}

/** Scheduled `push.send` calls, oldest first. */
async function scheduledPushes(t: Awaited<ReturnType<typeof fixture>>["t"]) {
  return await t.run(async (ctx) => {
    const jobs = await ctx.db.system.query("_scheduled_functions").collect();
    return jobs.filter((job) => job.name.startsWith("push:send")).map((job) => job.args[0]);
  });
}

describe("pushTokens schema", () => {
  // schema.ts cannot import the package (NoImportModuleInSchema), so the table
  // is local. It is deployed: this test stops it drifting from the package.
  test("matches the @vvedantb/server table", () => {
    const local = schema.tables.pushTokens;
    const shared = pushTokensTable(defineTable, v, v.id("users"));
    expect(local.validator).toEqual(v.object(pushTokensFields(v, v.id("users"))));
    expect(local[" indexes"]()).toEqual(shared[" indexes"]());
  });
});

describe("mobile push", () => {
  // Keep scheduled `push.send` jobs queued: they would call the Expo API.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test(
    "register rejects a non-Expo token and upserts a real one",
    async () => {
      const { t, asUser } = await fixture();
      await expect(asUser.mutation(api.push.register, { token: "nope", platform: "android" })).rejects.toThrow();
      await asUser.mutation(api.push.register, { token: TOKEN, platform: "android" });
      await asUser.mutation(api.push.register, { token: TOKEN, platform: "android" });
      const rows = await t.run((ctx) => ctx.db.query("pushTokens").collect());
      expect(rows).toHaveLength(1);
    },
    TIMEOUT_MS,
  );

  test(
    "an unrouted (comment) mention pushes with its chat; a task completion does not push",
    async () => {
      const { t, ids, asUser } = await fixture();
      await asUser.mutation(api.push.register, { token: TOKEN, platform: "android" });
      await t.run(async (ctx) => {
        await createNotification(ctx, {
          userId: ids.userId,
          type: "mention",
          title: "Grace mentioned you in a session chat",
          repoId: ids.repoId,
          sessionId: ids.sessionId,
        });
        await createNotification(ctx, {
          userId: ids.userId,
          type: "task_complete",
          title: "Task done",
          repoId: ids.repoId,
        });
      });
      const pushes = await scheduledPushes(t);
      expect(pushes).toEqual([
        expect.objectContaining({ title: "Grace mentioned you in a session chat", data: { target: ids.sessionId } }),
      ]);
      const mention = await t.run((ctx) =>
        ctx.db
          .query("notifications")
          .filter((q) => q.eq(q.field("type"), "mention"))
          .first(),
      );
      expect(mention?.chatTarget).toBe(ids.sessionId);
    },
    TIMEOUT_MS,
  );

  test(
    "a routed chat mention pushes once routing says it is not low",
    async () => {
      const { t, ids, asUser } = await fixture();
      await asUser.mutation(api.push.register, { token: TOKEN, platform: "android" });
      const mention = (title: string) =>
        t.run((ctx) =>
          createNotification(ctx, {
            userId: ids.userId,
            type: "mention",
            title,
            repoId: ids.repoId,
            sessionId: ids.sessionId,
            routesUrgency: true,
          }),
        );
      const low = await mention("low");
      const normal = await mention("normal");
      const fallback = await mention("fallback");
      await t.run((ctx) =>
        createNotification(ctx, { userId: ids.userId, type: "routed_question", title: "question", sessionId: ids.sessionId }),
      );
      // Routing has not answered yet: only the routed question pushed.
      expect((await scheduledPushes(t)).map((push) => push.title)).toEqual(["question"]);

      await t.mutation(internal.notifications.setUrgency, { notificationId: low, urgency: "low" });
      await t.mutation(internal.notifications.setUrgency, { notificationId: normal, urgency: "normal" });
      await t.mutation(internal.notifications.scheduleLegacyMentionEmail, { notificationId: fallback });
      expect(await scheduledPushes(t)).toEqual([
        expect.objectContaining({ title: "question" }),
        expect.objectContaining({ title: "normal", data: { target: ids.sessionId } }),
        expect.objectContaining({ title: "fallback", data: { target: ids.sessionId } }),
      ]);
    },
    TIMEOUT_MS,
  );

  test(
    "no registered phone means no push job",
    async () => {
      const { t, ids } = await fixture();
      await t.run((ctx) =>
        createNotification(ctx, { userId: ids.userId, type: "mention", title: "Hi", sessionId: ids.sessionId }),
      );
      expect(await scheduledPushes(t)).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    "an agent question pushes once, with the question as the body",
    async () => {
      const { t, ids, asUser } = await fixture();
      await asUser.mutation(api.push.register, { token: TOKEN, platform: "android" });
      const payload = JSON.stringify({
        questions: [
          { question: "Which colour?", header: "Colour", multiSelect: false, options: [{ label: "Red", description: "" }] },
        ],
      });
      const post = { entityId: ids.chatId, toolUseId: "tool-1", payload };
      await asUser.mutation(api.pendingQuestions.post, post);
      // A retried post of the same question must not push again.
      await asUser.mutation(api.pendingQuestions.post, post);
      expect(await scheduledPushes(t)).toEqual([
        expect.objectContaining({ title: "Fix the login bug", body: "Which colour?", data: { target: ids.chatId } }),
      ]);
    },
    TIMEOUT_MS,
  );

  test(
    "getChat opens a session's Main chat from the session id",
    async () => {
      const { ids, asUser } = await fixture();
      const chat = await asUser.query(api.mobile.getChat, { target: ids.sessionId });
      expect(chat).toMatchObject({
        kind: "session",
        title: "Fix the login bug",
        parentId: ids.chatId,
        canReply: true,
        webPath: "/vvedantb/eva/sessions/42",
      });
    },
    TIMEOUT_MS,
  );

  test(
    "listChats marks a session whose open turn waits on a question",
    async () => {
      const { t, ids, asUser } = await fixture();
      const before = await asUser.query(api.mobile.listChats, {});
      expect(before[0]?.isAwaitingAnswer).toBe(false);
      await t.run(async (ctx) => {
        await ctx.db.insert("turns", {
          entityId: ids.chatId,
          sessionId: ids.sessionId,
          streamingEntityId: String(ids.chatId),
          state: "running",
          open: true,
          turnStartedAt: Date.now(),
          leaseExpiresAt: Date.now() + 60_000,
          leaseGeneration: 1,
          model: "claude:sonnet",
          repoId: ids.repoId,
        });
        await ctx.db.insert("pendingQuestions", {
          entityId: ids.chatId,
          toolUseId: "tool-2",
          payload: "{}",
          createdAt: Date.now(),
        });
      });
      const after = await asUser.query(api.mobile.listChats, {});
      expect(after[0]).toMatchObject({ sessionId: ids.sessionId, isAwaitingAnswer: true });
    },
    TIMEOUT_MS,
  );
});
