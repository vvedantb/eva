import { convexTest } from "convex-test";
import { describe, expect, test } from "bun:test";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { modules } from "./_helpers/convexModules";

/**
 * Inbox archive (2026-09-16) is a soft state, not a delete: `archivedAt` moves
 * the row out of the notification list and the unread badge (Done in the
 * Inbox archives a notification), and unarchiving puts it back. `list`,
 * `countUnread` and the bulk mutations have to agree on that one field, so
 * the invariants live here rather than in any one of them.
 *
 * The bulk mutations also take caller-supplied ids. Those are guessable from
 * another user's inbox, so an id the caller does not own must be skipped
 * silently: a stale id in a selection cannot be allowed to fail the whole
 * action, and somebody else's row cannot be allowed to change.
 *
 * Behavioural (convex-test) rather than source-level: what broke would be a
 * filter quietly dropped, which only shows up when the real query runs.
 */


/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|inbox-archive";
const OTHER_CLERK_ID = "clerk|inbox-archive-other";

/** Two unread notifications for the caller, one for somebody else. */
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const otherUserId = await ctx.db.insert("users", {
      clerkId: OTHER_CLERK_ID,
    });
    const notify = (owner: Id<"users">, title: string) =>
      ctx.db.insert("notifications", {
        userId: owner,
        type: "system",
        title,
        read: false,
        createdAt: Date.now(),
      });
    return {
      userId,
      mine: await notify(userId, "First"),
      alsoMine: await notify(userId, "Second"),
      theirs: await notify(otherUserId, "Not yours"),
    };
  });
  return { t, asUser: t.withIdentity({ subject: CLERK_ID }), ...ids };
}

describe("inbox archive", () => {
  test(
    "archiving takes the row out of the inbox and the unread badge",
    async () => {
      const f = await fixture();
      await f.asUser.mutation(api.notifications.archiveMany, {
        ids: [f.mine],
      });

      const inbox = await f.asUser.query(api.notifications.list, {});
      expect(inbox.map((n) => n._id)).toEqual([f.alsoMine]);

      // Archiving marks read, so an archived row can never sit behind the badge.
      expect(await f.asUser.query(api.notifications.countUnread, {})).toBe(1);
      const row = await f.t.run((ctx) => ctx.db.get(f.mine));
      expect(row?.read).toBe(true);
      expect(row?.archivedAt).toBeTypeOf("number");
    },
    TIMEOUT_MS,
  );

  test(
    "unarchiving returns the row without resurfacing it as unread",
    async () => {
      const f = await fixture();
      await f.asUser.mutation(api.notifications.archiveMany, {
        ids: [f.mine],
      });
      await f.asUser.mutation(api.notifications.unarchiveMany, {
        ids: [f.mine],
      });

      const inbox = await f.asUser.query(api.notifications.list, {});
      expect(inbox.map((n) => n._id)).toContain(f.mine);
      // The field has to be removed, not set to a falsy stamp: "not archived"
      // is the absence of `archivedAt`.
      const row = await f.t.run((ctx) => ctx.db.get(f.mine));
      expect(row?.archivedAt).toBeUndefined();
      expect(row?.read).toBe(true);
      expect(await f.asUser.query(api.notifications.countUnread, {})).toBe(1);
    },
    TIMEOUT_MS,
  );

  test(
    "an archived row still stored unread stays out of the badge",
    async () => {
      const f = await fixture();
      // Archived *and* unread cannot be reached through `archiveMany` (which
      // marks read), but it is the state the badge's guard exists for.
      await f.t.run((ctx) =>
        ctx.db.insert("notifications", {
          userId: f.userId,
          type: "system",
          title: "Archived elsewhere",
          read: false,
          archivedAt: Date.now(),
          createdAt: Date.now(),
        }),
      );

      expect(await f.asUser.query(api.notifications.countUnread, {})).toBe(2);
    },
    TIMEOUT_MS,
  );

  test(
    "bulk mutations skip ids the caller does not own instead of failing",
    async () => {
      const f = await fixture();
      await f.asUser.mutation(api.notifications.archiveMany, {
        ids: [f.mine, f.theirs],
      });

      expect((await f.t.run((ctx) => ctx.db.get(f.mine)))?.read).toBe(true);
      const theirs = await f.t.run((ctx) => ctx.db.get(f.theirs));
      expect(theirs?.read).toBe(false);
      expect(theirs?.archivedAt).toBeUndefined();
    },
    TIMEOUT_MS,
  );

  test(
    "a selection larger than the batch limit is rejected, not walked",
    async () => {
      const f = await fixture();
      await expect(
        f.asUser.mutation(api.notifications.archiveMany, {
          ids: Array.from({ length: 101 }, () => f.mine),
        }),
      ).rejects.toThrow(/Too many notifications/);
    },
    TIMEOUT_MS,
  );
});
