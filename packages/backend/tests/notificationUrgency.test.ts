import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

/**
 * Mention routing (2026-09-21) makes a mention's urgency decide how it is
 * delivered: `high` earns an instant email, `normal` waits for the daily
 * digest, `low` never leaves the inbox. Three separate places have to agree on
 * that one field — the instant-email query, the digest query and the mutation
 * routing calls back into — and the failure mode of each is silent: an email
 * that never arrives, or one that arrives for an offhand credit.
 *
 * The degraded path matters as much as the happy one. Routing is a network
 * call that can fail, and a mention it never judged keeps `urgency` undefined;
 * that mention must still email, exactly as it did before routing existed.
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|notification-urgency";

type Urgency = "low" | "normal" | "high";

/**
 * One emailable user with an unread mention at each urgency — including one
 * that routing has not judged yet — plus a non-mention type, which carries no
 * urgency and must be untouched by any of this.
 */
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkId: CLERK_ID,
      email: "ada@example.com",
      fullName: "Ada Lovelace",
      emailNotificationsEnabled: true,
    });
    const mention = (title: string, urgency: Urgency | undefined) =>
      ctx.db.insert("notifications", {
        userId,
        type: "mention" as const,
        title,
        read: false,
        createdAt: Date.now(),
        urgency,
      });
    return {
      userId,
      high: await mention("high mention", "high"),
      normal: await mention("normal mention", "normal"),
      low: await mention("low mention", "low"),
      unrouted: await mention("unrouted mention", undefined),
      reply: await ctx.db.insert("notifications", {
        userId,
        type: "comment_reply" as const,
        title: "comment reply",
        read: false,
        createdAt: Date.now(),
      }),
    };
  });
  return { t, ...ids };
}

/** `null` for "no urgency": `t.run` returns Convex values, which have no undefined. */
async function urgencyOf(
  t: Awaited<ReturnType<typeof fixture>>["t"],
  id: Id<"notifications">,
): Promise<Urgency | null> {
  return t.run(async (ctx) => (await ctx.db.get(id))?.urgency ?? null);
}

describe("notification urgency", () => {
  test(
    "the instant email takes high and unrouted mentions and leaves the rest",
    async () => {
      const f = await fixture();
      const data = await f.t.query(
        internal.notifications.getUnreadEmailableForUser,
        { userId: f.userId },
      );

      expect(data).not.toBeNull();
      const titles = (data?.notifications ?? []).map((n) => n.title);
      expect(titles).toContain("high mention");
      // Routing failed or has not landed: degrade to the old behaviour rather
      // than swallow the mention.
      expect(titles).toContain("unrouted mention");
      expect(titles).not.toContain("normal mention");
      expect(titles).not.toContain("low mention");
      // Only mentions are routed; every other high-signal type is unchanged.
      expect(titles).toContain("comment reply");
    },
    TIMEOUT_MS,
  );

  test(
    "the daily digest drops low urgency and keeps everything else",
    async () => {
      const f = await fixture();
      const recipients = await f.t.query(
        internal.notifications.getDigestRecipients,
        { since: 0 },
      );

      const titles = (recipients[0]?.notifications ?? []).map((n) => n.title);
      expect(titles).toContain("high mention");
      expect(titles).toContain("normal mention");
      expect(titles).toContain("unrouted mention");
      expect(titles).toContain("comment reply");
      expect(titles).not.toContain("low mention");
    },
    TIMEOUT_MS,
  );

  test(
    "setUrgency records the routing decision on the row",
    async () => {
      const f = await fixture();
      expect(await urgencyOf(f.t, f.unrouted)).toBeNull();

      await f.t.mutation(internal.notifications.setUrgency, {
        notificationId: f.unrouted,
        urgency: "high",
      });
      expect(await urgencyOf(f.t, f.unrouted)).toBe("high");

      // The row now emails, where before routing landed it also did — the
      // point is that `normal` and `low` are the ones that stop.
      await f.t.mutation(internal.notifications.setUrgency, {
        notificationId: f.unrouted,
        urgency: "low",
      });
      const data = await f.t.query(
        internal.notifications.getUnreadEmailableForUser,
        { userId: f.userId },
      );
      expect((data?.notifications ?? []).map((n) => n.title)).not.toContain(
        "unrouted mention",
      );
    },
    TIMEOUT_MS,
  );

  test(
    "setUrgency on a deleted row is a no-op rather than a throw",
    async () => {
      const f = await fixture();
      await f.t.run(async (ctx) => ctx.db.delete(f.low));
      await expect(
        f.t.mutation(internal.notifications.setUrgency, {
          notificationId: f.low,
          urgency: "high",
        }),
      ).resolves.toBeNull();
    },
    TIMEOUT_MS,
  );
});
