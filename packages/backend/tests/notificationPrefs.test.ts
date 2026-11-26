import { convexTest } from "convex-test";
import { describe, expect, test } from "bun:test";
import { internal } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { createNotification } from "../convex/notifications";
import { notificationPrefsFromLegacy } from "../convex/_users/notificationPrefs";
import { modules } from "./_helpers/convexModules";

/**
 * The email and push choices (plan `notifications-v2-5.md`, part D): unset
 * email is on (urgent at once, the rest in the digest), off sends nothing,
 * push off never pushes, and the migration maps the old opt-in.
 */

const TIMEOUT_MS = 30_000;

type Prefs = Doc<"users">["notificationPrefs"];

async function fixture(notificationPrefs: Prefs) {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      clerkId: "clerk|prefs",
      email: "ada@example.com",
      notificationPrefs,
    });
    await ctx.db.insert("pushTokens", {
      userId: id,
      token: "ExponentPushToken[prefs]",
      platform: "android",
      updatedAt: 0,
    });
    // An instant type (assignment) and a digest type (task done).
    await createNotification(ctx, {
      userId: id,
      type: "task_assigned",
      title: "Assigned to you",
    });
    await createNotification(ctx, {
      userId: id,
      type: "task_complete",
      title: "Task done",
    });
    return id;
  });
  const scheduled = async (prefix: string) =>
    t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).filter(
        (job) => job.name.startsWith(prefix),
      ).length,
    );
  return {
    t,
    instantEmails: () => scheduled("notificationEmail:sendUnreadForUser"),
    pushes: () => scheduled("push:send"),
    instantSweep: () =>
      t.query(internal.notifications.getUnreadEmailableForUser, { userId }),
    digestTitles: async () =>
      (
        await t.query(internal.notifications.getDigestRecipients, { since: 0 })
      ).flatMap((r) => r.notifications.map((n) => n.title)),
  };
}

describe("notification preferences", () => {
  test(
    "unset email is instant: an instant type emails at once",
    async () => {
      const f = await fixture(undefined);
      expect(await f.instantEmails()).toBe(1);
      expect((await f.instantSweep())?.notifications.map((n) => n.title)).toEqual([
        "Assigned to you",
      ]);
      expect(await f.pushes()).toBe(1);
    },
    TIMEOUT_MS,
  );

  test(
    "off: no instant email and no digest",
    async () => {
      const f = await fixture({ email: false });
      expect(await f.instantEmails()).toBe(0);
      expect(await f.instantSweep()).toBeNull();
      expect(await f.digestTitles()).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    "push off: nothing pushes",
    async () => {
      const f = await fixture({ push: false });
      expect(await f.pushes()).toBe(0);
      expect(await f.instantEmails()).toBe(1);
    },
    TIMEOUT_MS,
  );
});

describe("migrateNotificationPrefs", () => {
  // The migration's `migrateOne` is `notificationPrefsFromLegacy`: convex-test
  // cannot run the migrations component (no `getFunctionMetadata` syscall).
  test(
    "true → instant, false → off, unset stays unset; the legacy field clears",
    async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        const user = async (
          legacy: boolean | undefined,
          notificationPrefs?: Prefs,
        ) => {
          const id = await ctx.db.insert("users", {
            emailNotificationsEnabled: legacy,
            notificationPrefs,
          });
          const doc = await ctx.db.get(id);
          if (!doc) throw new Error("user missing");
          const patch = notificationPrefsFromLegacy(doc);
          if (patch) await ctx.db.patch(id, patch);
          return ctx.db.get(id);
        };
        const cases: Array<[Doc<"users"> | null, Prefs]> = [
          [await user(true), { email: true, productUpdates: true }],
          [await user(false), { email: false }],
          [await user(undefined), undefined],
          // A choice made since the deploy wins.
          [await user(false, { email: true }), { email: true }],
        ];
        for (const [migrated, expected] of cases) {
          expect(migrated?.notificationPrefs).toEqual(expected);
          expect(migrated?.emailNotificationsEnabled).toBeUndefined();
        }
      });
    },
    TIMEOUT_MS,
  );
});
