import { convexTest } from "convex-test";
import { describe, expect, test } from "bun:test";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { BG_HEAL_MIN_INTERVAL_MS } from "../convex/sandboxHeal";
import { modules } from "./_helpers/convexModules";


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
      owner: { kind: "standalone" },
      repoId,
      userId,
      title: "Preview heal gate",
      status: "active",
      sandboxId: SANDBOX_ID,
      ...(servicesPending ? { sandboxServicesPending: true } : {}),
    });
  });
}

async function stampCount(t: ReturnType<typeof convexTest>): Promise<number> {
  return t.run(async (ctx) => {
    const stamps = await ctx.db.query("sandboxHealStamps").collect();
    return stamps.filter((stamp) => stamp.sandboxId === SANDBOX_ID).length;
  });
}

describe("the preview heal waits for the session's own service launch", () => {
  test("the throttle interval stays in the 30-60s band", () => {
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
