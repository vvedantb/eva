import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { sessionPrArchiveNotificationCopy } from "../convex/_sessions/prArchive";

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
      prCount: 1,
    });
    await ctx.db.insert("pullRequests", {
      repoId,
      prUrl: PR_URL,
      prNumber: 664,
      headBranch: `eva/session-${sessionId}`,
      state: "open",
      primary: true,
      origin: "eva",
      owner: { kind: "session", sessionId },
      createdAt: 1,
      updatedAt: 1,
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
        prs: [{ url: PR_URL, prNumber: 664, merged: true }],
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
        prs: [{ url: PR_URL, prNumber: 664, merged: false }],
      }),
    ).toEqual({
      title: `PR #664 closed — "${SESSION_TITLE}" archived`,
      message: `PR #664 was closed on GitHub without merging (${PR_URL}). Your session was archived.`,
    });
  });

  test("multi-repo session lists every PR that triggered the archive", () => {
    const secondUrl = "https://github.com/vvedantb/eva-api/pull/12";
    expect(
      sessionPrArchiveNotificationCopy({
        sessionTitle: SESSION_TITLE,
        prs: [
          { url: PR_URL, prNumber: 664, merged: true },
          { url: secondUrl, prNumber: 12, merged: true },
        ],
      }),
    ).toEqual({
      title: `PR #664, PR #12 merged — "${SESSION_TITLE}" archived`,
      message: `Your session was archived because every pull request it opened is now closed: ${PR_URL}, ${secondUrl}.`,
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
        prs: [{ url: PR_URL, prNumber: 664, merged: true }],
      });

      await t.mutation(internal.githubWebhook.handlePullRequestEvent, {
        prUrl: PR_URL,
        action: "closed",
        merged: true,
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
        prs: [{ url: PR_URL, prNumber: 664, merged: false }],
      });

      await t.mutation(internal.githubWebhook.handlePullRequestEvent, {
        prUrl: PR_URL,
        action: "closed",
        merged: false,
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
      };

      await t.mutation(internal.githubWebhook.handlePullRequestEvent, payload);
      await t.mutation(internal.githubWebhook.handlePullRequestEvent, payload);

      const notifications = await listOwnerNotifications(t, ownerUserId);
      expect(notifications).toHaveLength(1);
    },
    TIMEOUT_MS,
  );

  test(
    "close then merge still leaves a single inbox item",
    async () => {
      const { t, ownerUserId } = await fixture();

      await t.mutation(internal.githubWebhook.handlePullRequestEvent, {
        prUrl: PR_URL,
        action: "closed",
        merged: false,
      });
      await t.mutation(internal.githubWebhook.handlePullRequestEvent, {
        prUrl: PR_URL,
        action: "closed",
        merged: true,
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

      await t.mutation(internal.githubWebhook.handlePullRequestEvent, {
        prUrl: PR_URL,
        action: "closed",
        merged: true,
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

      await t.mutation(internal.githubWebhook.handlePullRequestEvent, {
        prUrl: PR_URL,
        action: "closed",
        merged: true,
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

describe("a session holding several pull requests", () => {
  const SIDE_PR_URL = "https://github.com/vvedantb/eva/pull/700";

  async function openSidePr(
    t: Awaited<ReturnType<typeof fixture>>["t"],
    sessionId: Awaited<ReturnType<typeof fixture>>["sessionId"],
  ) {
    await t.mutation(internal.githubWebhook.handlePullRequestEvent, {
      prUrl: SIDE_PR_URL,
      action: "opened",
      draft: false,
      title: "Ship the login fix on its own",
      headBranch: `eva/session-${sessionId}-login-fix`,
      baseBranch: "main",
      repoOwner: "vvedantb",
      repoName: "eva",
      headInSameRepo: true,
    });
  }

  test(
    "a PR the agent opened on a side branch is linked to the session",
    async () => {
      const { t, sessionId } = await fixture();
      await openSidePr(t, sessionId);

      const rows = await t.run(async (ctx) =>
        ctx.db
          .query("pullRequests")
          .withIndex("by_session", (q) => q.eq("owner.sessionId", sessionId))
          .collect(),
      );
      const side = rows.find((row) => row.prUrl === SIDE_PR_URL);
      expect(side).toMatchObject({
        primary: false,
        origin: "agent",
        state: "open",
        prNumber: 700,
      });
      const session = await t.run(async (ctx) => ctx.db.get(sessionId));
      // The session's own PR stays the one its chrome links to.
      expect(session?.prUrl).toBe(PR_URL);
      expect(session?.prCount).toBe(2);
    },
    TIMEOUT_MS,
  );

  test(
    "a branch from a fork is never linked, whatever it is called",
    async () => {
      const { t, sessionId } = await fixture();
      await t.mutation(internal.githubWebhook.handlePullRequestEvent, {
        prUrl: SIDE_PR_URL,
        action: "opened",
        headBranch: `eva/session-${sessionId}-login-fix`,
        repoOwner: "vvedantb",
        repoName: "eva",
        headInSameRepo: false,
      });
      const row = await t.run(async (ctx) =>
        ctx.db
          .query("pullRequests")
          .withIndex("by_pr_url", (q) => q.eq("prUrl", SIDE_PR_URL))
          .first(),
      );
      expect(row).toBeNull();
    },
    TIMEOUT_MS,
  );

  test(
    "merging one PR leaves the session live while another is open",
    async () => {
      const { t, ownerUserId, sessionId } = await fixture();
      await openSidePr(t, sessionId);

      await t.mutation(internal.githubWebhook.handlePullRequestEvent, {
        prUrl: PR_URL,
        action: "closed",
        merged: true,
      });
      let session = await t.run(async (ctx) => ctx.db.get(sessionId));
      expect(session?.archived).not.toBe(true);
      expect(session?.prState).toBe("open");
      expect(await listOwnerNotifications(t, ownerUserId)).toHaveLength(0);

      await t.mutation(internal.githubWebhook.handlePullRequestEvent, {
        prUrl: SIDE_PR_URL,
        action: "closed",
        merged: true,
      });
      session = await t.run(async (ctx) => ctx.db.get(sessionId));
      expect(session?.archived).toBe(true);
      expect(session?.prState).toBe("merged");
      const notifications = await listOwnerNotifications(t, ownerUserId);
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toContain("PR #664, PR #700 merged");
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
