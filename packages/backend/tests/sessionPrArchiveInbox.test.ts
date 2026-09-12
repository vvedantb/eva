import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { sessionPrArchiveNotificationCopy } from "../convex/githubWebhook";

const modules = import.meta.glob("../convex/**/*.ts");
const testsDir = dirname(fileURLToPath(import.meta.url));

const PR_URL = "https://github.com/vvedantb/eva/pull/664";
const SESSION_TITLE = "Fix the login bug";
const TIMEOUT_MS = 30_000;

function notificationsSource(): string {
  return readFileSync(join(testsDir, "../convex/notifications.ts"), "utf8");
}

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const ownerUserId = await ctx.db.insert("users", {
      email: "vedant@example.com",
      emailNotificationsEnabled: true,
    });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: ownerUserId,
    });
    const sessionId = await ctx.db.insert("sessions", {
      repoId,
      userId: ownerUserId,
      createdBy: ownerUserId,
      title: SESSION_TITLE,
      status: "active",
      numId: 42,
      prUrl: PR_URL,
      prState: "open",
    });
    return { ownerUserId, repoId, sessionId };
  });
  return { t, ...ids };
}

async function listOwnerNotifications(
  t: Awaited<ReturnType<typeof fixture>>["t"],
  userId: Awaited<ReturnType<typeof fixture>>["ownerUserId"],
) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  );
}

describe("session PR archive inbox copy", () => {
  test("names the session and PR for a merge", () => {
    expect(
      sessionPrArchiveNotificationCopy({
        sessionTitle: SESSION_TITLE,
        prUrl: PR_URL,
        prNumber: 664,
        merged: true,
      }),
    ).toEqual({
      title: `PR #664 merged — "${SESSION_TITLE}" archived`,
      message: `PR #664 was merged on GitHub (${PR_URL}). Your session was archived.`,
    });
  });

  test("names the session and PR for a close without merge", () => {
    expect(
      sessionPrArchiveNotificationCopy({
        sessionTitle: SESSION_TITLE,
        prUrl: PR_URL,
        merged: false,
      }),
    ).toEqual({
      title: `PR #664 closed — "${SESSION_TITLE}" archived`,
      message: `PR #664 was closed on GitHub without merging (${PR_URL}). Your session was archived.`,
    });
  });
});

describe("inbox notification when a session auto-archives on PR close/merge", () => {
  test(
    "archiving on merge creates one inbox item for the owner",
    async () => {
      const { t, ownerUserId, sessionId } = await fixture();
      const expected = sessionPrArchiveNotificationCopy({
        sessionTitle: SESSION_TITLE,
        prUrl: PR_URL,
        prNumber: 664,
        merged: true,
      });

      await t.mutation(internal.githubWebhook.handleSessionPrEvent, {
        prUrl: PR_URL,
        action: "closed",
        merged: true,
        prNumber: 664,
      });

      const notifications = await listOwnerNotifications(t, ownerUserId);
      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({
        userId: ownerUserId,
        type: "session_archived",
        title: expected.title,
        message: expected.message,
        read: false,
        href: "/vvedantb/eva/sessions/42",
      });

      const session = await t.run(async (ctx) => ctx.db.get(sessionId));
      expect(session?.archived).toBe(true);
      expect(session?.prState).toBe("merged");
    },
    TIMEOUT_MS,
  );

  test(
    "archiving on close creates one inbox item for the owner",
    async () => {
      const { t, ownerUserId } = await fixture();
      const expected = sessionPrArchiveNotificationCopy({
        sessionTitle: SESSION_TITLE,
        prUrl: PR_URL,
        prNumber: 664,
        merged: false,
      });

      await t.mutation(internal.githubWebhook.handleSessionPrEvent, {
        prUrl: PR_URL,
        action: "closed",
        merged: false,
        prNumber: 664,
      });

      const notifications = await listOwnerNotifications(t, ownerUserId);
      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({
        type: "session_archived",
        title: expected.title,
        message: expected.message,
      });
    },
    TIMEOUT_MS,
  );

  test(
    "a duplicate webhook does not create a second inbox item",
    async () => {
      const { t, ownerUserId } = await fixture();
      const payload = {
        prUrl: PR_URL,
        action: "closed" as const,
        merged: true,
        prNumber: 664,
      };

      await t.mutation(internal.githubWebhook.handleSessionPrEvent, payload);
      await t.mutation(internal.githubWebhook.handleSessionPrEvent, payload);

      const notifications = await listOwnerNotifications(t, ownerUserId);
      expect(notifications).toHaveLength(1);
    },
    TIMEOUT_MS,
  );

  test(
    "close then merge still leaves a single inbox item",
    async () => {
      const { t, ownerUserId } = await fixture();

      await t.mutation(internal.githubWebhook.handleSessionPrEvent, {
        prUrl: PR_URL,
        action: "closed",
        merged: false,
        prNumber: 664,
      });
      await t.mutation(internal.githubWebhook.handleSessionPrEvent, {
        prUrl: PR_URL,
        action: "closed",
        merged: true,
        prNumber: 664,
      });

      const notifications = await listOwnerNotifications(t, ownerUserId);
      expect(notifications).toHaveLength(1);
    },
    TIMEOUT_MS,
  );

  test(
    "this event is not instant-emailed",
    async () => {
      const { t, ownerUserId } = await fixture();

      await t.mutation(internal.githubWebhook.handleSessionPrEvent, {
        prUrl: PR_URL,
        action: "closed",
        merged: true,
        prNumber: 664,
      });

      const emailable = await t.query(
        internal.notifications.getUnreadEmailableForUser,
        { userId: ownerUserId },
      );
      expect(emailable).toBeNull();
    },
    TIMEOUT_MS,
  );

  test(
    "this event is excluded from the daily digest email",
    async () => {
      const { t } = await fixture();

      await t.mutation(internal.githubWebhook.handleSessionPrEvent, {
        prUrl: PR_URL,
        action: "closed",
        merged: true,
        prNumber: 664,
      });

      const recipients = await t.query(
        internal.notifications.getDigestRecipients,
        { since: 0 },
      );
      expect(recipients).toEqual([]);
    },
    TIMEOUT_MS,
  );
});

describe("session_archived stays off the email pipeline", () => {
  const source = notificationsSource();

  test("is excluded from the daily digest", () => {
    expect(source).toContain('"session_archived"');
    const digestBlock = source.slice(
      source.indexOf("const DIGEST_EXCLUDED_TYPES"),
      source.indexOf("const DIGEST_EXCLUDED_TYPES") + 600,
    );
    expect(digestBlock).toContain('"session_archived"');
  });

  test("is not an instant-email type", () => {
    const instantBlock = source.slice(
      source.indexOf("const EMAIL_NOTIFICATION_TYPES"),
      source.indexOf("const EMAIL_NOTIFICATION_TYPES") + 400,
    );
    expect(instantBlock).not.toContain("session_archived");
  });
});
