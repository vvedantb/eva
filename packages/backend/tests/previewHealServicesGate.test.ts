import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { BG_HEAL_MIN_INTERVAL_MS } from "../convex/sandboxHeal";

/**
 * Prod (2026-09-01): the preview heal launched a session's background daemons
 * while the session lifecycle was still between early-ready and final-ready.
 * The lifecycle's own launch ~15s later killed those wrappers, orphaned their
 * children and truncated /tmp/bg-<i>.log. `claim` now refuses while the owning
 * session has `sandboxServicesPending` set (fix cf8a50f21).
 *
 * This runs the mutation, because the two properties that actually matter are
 * behavioural: the gate blocks, and it does NOT consume the interval slot.
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;
const SANDBOX_ID = "sbx-preview-heal-gate";

async function seedSession(
  t: ReturnType<typeof convexTest>,
  servicesPending: boolean,
) {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkId: "clerk|preview-heal-gate",
    });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "eva",
      name: "preview-heal-gate-test",
      installationId: 1,
    });
    return ctx.db.insert("sessions", {
      repoId,
      userId,
      title: "Preview heal gate",
      status: "active",
      sandboxId: SANDBOX_ID,
      ...(servicesPending ? { sandboxServicesPending: true } : {}),
    });
  });
}

/** Heal stamps for one sandbox. An empty list means the slot is still free. */
async function stampCount(t: ReturnType<typeof convexTest>): Promise<number> {
  return t.run(async (ctx) => {
    const stamps = await ctx.db.query("sandboxHealStamps").collect();
    return stamps.filter((stamp) => stamp.sandboxId === SANDBOX_ID).length;
  });
}

describe("the preview heal waits for the session's own service launch", () => {
  test("the throttle interval stays in the 30-60s band", () => {
    // The point is fewer execs (the poll fires every ~2s per open page)
    // without letting a dead background daemon linger.
    expect(BG_HEAL_MIN_INTERVAL_MS).toBeGreaterThanOrEqual(30_000);
    expect(BG_HEAL_MIN_INTERVAL_MS).toBeLessThanOrEqual(60_000);
  });

  test(
    "a session still launching services never wins the claim",
    async () => {
      const t = convexTest(schema, modules);
      await seedSession(t, true);

      expect(
        await t.mutation(internal.sandboxHeal.claim, {
          sandboxId: SANDBOX_ID,
        }),
      ).toBe(false);
      // Repeated polls (~2s each) must all be refused, not just the first.
      expect(
        await t.mutation(internal.sandboxHeal.claim, {
          sandboxId: SANDBOX_ID,
        }),
      ).toBe(false);
    },
    TIMEOUT_MS,
  );

  test(
    "the gate does not burn the interval, so final-ready heals at once",
    async () => {
      const t = convexTest(schema, modules);
      const sessionId = await seedSession(t, true);

      expect(
        await t.mutation(internal.sandboxHeal.claim, {
          sandboxId: SANDBOX_ID,
        }),
      ).toBe(false);
      // Stamping on a gated claim would make the next 45s of polls lose the
      // rate-limit check instead, delaying the first real heal.
      expect(await stampCount(t)).toBe(0);

      await t.run(async (ctx) => {
        await ctx.db.patch(sessionId, { sandboxServicesPending: undefined });
      });

      expect(
        await t.mutation(internal.sandboxHeal.claim, {
          sandboxId: SANDBOX_ID,
        }),
      ).toBe(true);
      expect(await stampCount(t)).toBe(1);
    },
    TIMEOUT_MS,
  );

  test(
    "a won claim still holds the slot for the throttle interval",
    async () => {
      const t = convexTest(schema, modules);
      await seedSession(t, false);

      expect(
        await t.mutation(internal.sandboxHeal.claim, {
          sandboxId: SANDBOX_ID,
        }),
      ).toBe(true);
      expect(
        await t.mutation(internal.sandboxHeal.claim, {
          sandboxId: SANDBOX_ID,
        }),
      ).toBe(false);

      // Past the interval the slot frees up again.
      await t.run(async (ctx) => {
        const stamps = await ctx.db.query("sandboxHealStamps").collect();
        const stamp = stamps.find((row) => row.sandboxId === SANDBOX_ID);
        if (!stamp) throw new Error("expected a heal stamp");
        await ctx.db.patch(stamp._id, {
          lastHealAt: Date.now() - BG_HEAL_MIN_INTERVAL_MS - 1_000,
        });
      });
      expect(
        await t.mutation(internal.sandboxHeal.claim, {
          sandboxId: SANDBOX_ID,
        }),
      ).toBe(true);
    },
    TIMEOUT_MS,
  );

  test(
    "task and project sandboxes have no session row and are unaffected",
    async () => {
      const t = convexTest(schema, modules);
      expect(
        await t.mutation(internal.sandboxHeal.claim, {
          sandboxId: SANDBOX_ID,
        }),
      ).toBe(true);
    },
    TIMEOUT_MS,
  );
});
