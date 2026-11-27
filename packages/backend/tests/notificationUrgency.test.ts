import { convexTest } from "convex-test";
import { describe, expect, test } from "bun:test";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { modules } from "./_helpers/convexModules";


const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|notification-urgency";

type Urgency = "low" | "normal" | "high";

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
      expect(titles).toContain("unrouted mention");
      expect(titles).not.toContain("normal mention");
      expect(titles).not.toContain("low mention");
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
