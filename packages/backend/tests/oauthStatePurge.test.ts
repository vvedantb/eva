import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * The OAuth state purge crons (2026-10-26) read `by_expires_at` with a range
 * instead of scanning with `.filter`. A flipped bound would delete the nonce
 * of every login still in flight, so the callback fails with "state expired".
 * Behavioural (convex-test): only the real index range shows which rows go.
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;
const MINUTE_MS = 60_000;

describe("purgeExpiredOauthStates", () => {
  test(
    "drops expired GitHub states and keeps live ones",
    async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", { clerkId: "clerk|gh" });
        const now = Date.now();
        await ctx.db.insert("githubOauthStates", {
          nonce: "expired",
          userId,
          expiresAt: now - MINUTE_MS,
        });
        await ctx.db.insert("githubOauthStates", {
          nonce: "live",
          userId,
          expiresAt: now + 10 * MINUTE_MS,
        });
      });

      await t.mutation(internal._github.userTokens.purgeExpiredOauthStates, {});

      const nonces = await t.run(async (ctx) =>
        (await ctx.db.query("githubOauthStates").collect()).map(
          (row) => row.nonce,
        ),
      );
      expect(nonces).toEqual(["live"]);
    },
    TIMEOUT_MS,
  );

  test(
    "drops expired connector states and keeps live ones",
    async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", { clerkId: "clerk|conn" });
        const now = Date.now();
        await ctx.db.insert("connectorOauthStates", {
          nonce: "expired",
          userId,
          provider: "linear",
          actor: "user",
          expiresAt: now - MINUTE_MS,
        });
        await ctx.db.insert("connectorOauthStates", {
          nonce: "live",
          userId,
          provider: "linear",
          actor: "user",
          expiresAt: now + 10 * MINUTE_MS,
        });
      });

      await t.mutation(internal._connectors.tokens.purgeExpiredOauthStates, {});

      const nonces = await t.run(async (ctx) =>
        (await ctx.db.query("connectorOauthStates").collect()).map(
          (row) => row.nonce,
        ),
      );
      expect(nonces).toEqual(["live"]);
    },
    TIMEOUT_MS,
  );
});
