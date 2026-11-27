import { convexTest } from "convex-test";
import { describe, expect, test } from "bun:test";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { modules } from "./_helpers/convexModules";


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
