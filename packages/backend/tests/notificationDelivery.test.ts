import { convexTest } from "convex-test";
import sendgrid from "@sendgrid/mail";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { digestWindowStart } from "../convex/_notifications/digestWindow";
import {
  notificationEmail,
  notificationToasts,
} from "@eva/shared/notificationRouting";
import { modules } from "./_helpers/convexModules";
import { stubEnv, unstubAllEnvs } from "./_helpers/env";

mock.module("../convex/_mentions/extractMentionedUserIds", () => ({
  extractMentionedUserIds: (
    ctx: {
      db: { normalizeId: (table: "users", id: string) => Id<"users"> | null };
    },
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
const AUTHOR_CLERK = "clerk|delivery-author";

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const user = (clerkId: string, fullName: string) =>
      ctx.db.insert("users", {
        clerkId,
        fullName,
        email: `${clerkId.split("|")[1]}@example.com`,
        emailNotificationsEnabled: true,
      });
    const authorId = await user(AUTHOR_CLERK, "Grace Hopper");
    const adaId = await user("clerk|delivery-ada", "Ada Lovelace");
    const alanId = await user("clerk|delivery-alan", "Alan Turing");
    const teamId = await ctx.db.insert("teams", {
      name: "Eva",
      createdBy: authorId,
      createdAt: now,
    });
    for (const userId of [authorId, adaId, alanId]) {
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
    const taskId = await ctx.db.insert("agentTasks", {
      repoId,
      title: "Fix login",
      status: "todo",
      numId: 7,
      createdBy: authorId,
      createdAt: now,
      updatedAt: now,
    });
    return { authorId, adaId, alanId, repoId, taskId };
  });
  return { t, ids, asAuthor: t.withIdentity({ subject: AUTHOR_CLERK }) };
}

type T = Awaited<ReturnType<typeof fixture>>["t"];

function mentionToken(name: string, userId: Id<"users">): string {
  return `@[${name}](${userId})`;
}

async function notificationsFor(t: T, userId: Id<"users">) {
  return t.run((ctx) =>
    ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  );
}

async function scheduledEmails(t: T) {
  return t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect())
      .filter((job) => job.name.startsWith("notificationEmail:sendUnreadForUser"))
      .map((job) => job.args[0]),
  );
}

afterEach(() => {
  unstubAllEnvs();
});

describe("notification delivery", () => {
  test(
    "a task comment mention toasts and schedules its instant email",
    async () => {
      const { t, ids, asAuthor } = await fixture();
      await asAuthor.mutation(api.taskComments.create, {
        taskId: ids.taskId,
        content: `Can you look, ${mentionToken("Ada Lovelace", ids.adaId)}?`,
      });

      const [mention] = (await notificationsFor(t, ids.adaId)).filter(
        (row) => row.type === "mention",
      );
      expect(mention?.urgency).toBe("normal");
      expect(mention !== undefined && notificationToasts(mention)).toBe(true);
      expect(await scheduledEmails(t)).toContainEqual({ userId: ids.adaId });
      const email = await t.query(
        internal.notifications.getUnreadEmailableForUser,
        { userId: ids.adaId },
      );
      expect(email?.notifications.map((n) => n.id)).toEqual(
        mention ? [mention._id] : [],
      );
    },
    TIMEOUT_MS,
  );

  test(
    "a chat mention routing could not judge falls back to high: toasts and emails at once",
    async () => {
      const { t, ids } = await fixture();
      const notificationId = await t.run((ctx) =>
        ctx.db.insert("notifications", {
          userId: ids.adaId,
          type: "mention",
          title: "Grace mentioned you in a task chat",
          read: false,
          createdAt: Date.now(),
        }),
      );
      await t.mutation(internal.notifications.routeMentionFallback, {
        notificationId,
      });
      const row = await t.run((ctx) => ctx.db.get(notificationId));
      expect(row?.urgency).toBe("high");
      expect(row !== null && notificationToasts(row)).toBe(true);
      expect(row !== null && notificationEmail(row)).toBe("instant");
    },
    TIMEOUT_MS,
  );

  test(
    "the digest stamps what it sends, so the instant email never repeats it",
    async () => {
      stubEnv("SENDGRID_API_KEY", "test");
      stubEnv("SENDGRID_FROM_EMAIL", "eva@example.com");
      stubEnv("SENDGRID_DEV_TEST_EMAIL", "dev@example.com");
      stubEnv("WEB_APP_URL", "https://eva.test");
      spyOn(sendgrid, "setApiKey").mockImplementation(() => undefined);
      const accepted = { statusCode: 202, body: {}, headers: {} };
      const send = spyOn(sendgrid, "send").mockResolvedValue([
        { ...accepted, toString: () => "202" },
        {},
      ]);
      const { t, ids } = await fixture();
      await t.run((ctx) =>
        ctx.db.insert("notifications", {
          userId: ids.adaId,
          type: "task_assigned",
          title: 'Assigned: "Fix login"',
          read: false,
          createdAt: Date.now(),
        }),
      );

      await t.action(internal.notificationDigest.sendDailyDigests, {});

      expect(send).toHaveBeenCalledTimes(1);
      const [row] = await notificationsFor(t, ids.adaId);
      expect(row?.emailedAt).toBeNumber();
      expect(
        await t.query(internal.notifications.getUnreadEmailableForUser, {
          userId: ids.adaId,
        }),
      ).toBeNull();
      send.mockRestore();
    },
    TIMEOUT_MS,
  );

  test(
    "Monday's digest includes Saturday's notification",
    async () => {
      const monday = Date.UTC(2026, 10, 23, 8, 0, 0);
      const saturday = Date.UTC(2026, 10, 21, 14, 0, 0);
      expect(digestWindowStart(monday)).toBe(Date.UTC(2026, 10, 20, 8, 0, 0));
      expect(digestWindowStart(Date.UTC(2026, 10, 24, 8, 0, 5))).toBe(monday);

      const { t, ids } = await fixture();
      await t.run((ctx) =>
        ctx.db.insert("notifications", {
          userId: ids.adaId,
          type: "comment_added",
          title: 'New comment on "Fix login"',
          read: false,
          createdAt: saturday,
        }),
      );
      const recipients = await t.query(
        internal.notifications.getDigestRecipients,
        { since: digestWindowStart(monday) },
      );
      expect(recipients.flatMap((r) => r.notifications.map((n) => n.title))).toEqual(
        ['New comment on "Fix login"'],
      );
    },
    TIMEOUT_MS,
  );

  test(
    "a routed question is a Needs you question until it is read",
    async () => {
      const { t, ids } = await fixture();
      const notificationId = await t.run((ctx) =>
        ctx.db.insert("notifications", {
          userId: ids.authorId,
          type: "routed_question",
          title: 'Eva asked about "Rollout date"',
          read: false,
          createdAt: Date.now(),
          repoId: ids.repoId,
          chatTarget: ids.taskId,
        }),
      );
      const asAuthor = t.withIdentity({ subject: AUTHOR_CLERK });
      const rows = await asAuthor.query(api.needsYou.list, {});
      expect(rows).toContainEqual(
        expect.objectContaining({
          key: `notification:${notificationId}`,
          group: "question",
          source: "quick_task",
          chatTarget: ids.taskId,
        }),
      );

      await asAuthor.mutation(api.notifications.markAsRead, {
        id: notificationId,
      });
      expect(
        (await asAuthor.query(api.needsYou.list, {})).some(
          (row) => row.key === `notification:${notificationId}`,
        ),
      ).toBe(false);
    },
    TIMEOUT_MS,
  );

  test(
    "editing a comment to add a mention notifies only the new person",
    async () => {
      const { t, ids, asAuthor } = await fixture();
      const ada = mentionToken("Ada Lovelace", ids.adaId);
      const commentId = await asAuthor.mutation(api.taskComments.create, {
        taskId: ids.taskId,
        content: `Thoughts, ${ada}?`,
      });
      await asAuthor.mutation(api.taskComments.update, {
        id: commentId,
        content: `Thoughts, ${ada} and ${mentionToken("Alan Turing", ids.alanId)}?`,
      });

      const mentions = async (userId: Id<"users">) =>
        (await notificationsFor(t, userId)).filter(
          (row) => row.type === "mention",
        );
      expect(await mentions(ids.adaId)).toHaveLength(1);
      expect(await mentions(ids.alanId)).toEqual([
        expect.objectContaining({ commentId, urgency: "normal" }),
      ]);
      expect(await mentions(ids.authorId)).toEqual([]);
    },
    TIMEOUT_MS,
  );
});
