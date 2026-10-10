import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../convex/schema";
import { resolveMessageCredential } from "../convex/_userProviderAccounts/credentialSource";
import { findUsageLimitHold } from "../convex/_taskWorkflow/usageLimitReset";

/**
 * Regression guard for the per-account usage-limit hold. The hold reads the
 * failed turn's `credentialAccountId`. "Retry with account" patches that stamp
 * on the user message, so a retry on Team must clear a personal account's id,
 * not leave it behind. Otherwise a second limit on Team names the old account:
 * Team messages send straight into the limit, and the old account's wait.
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;

const HOUR_MS = 60 * 60 * 1000;

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const ownerId = await ctx.db.insert("users", { clerkId: "clerk|owner" });
    const strangerId = await ctx.db.insert("users", {
      clerkId: "clerk|stranger",
    });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: ownerId,
    });
    const taskId = await ctx.db.insert("agentTasks", {
      title: "Ran once",
      status: "code_review" as const,
      repoId,
      createdAt: now,
      updatedAt: now,
      createdBy: ownerId,
    });
    const account = {
      provider: "claude" as const,
      credentials: [],
      createdAt: now,
      updatedAt: now,
    };
    const ownAccountId = await ctx.db.insert("userProviderAccounts", {
      ...account,
      userId: ownerId,
      label: "Mine",
    });
    const strangerAccountId = await ctx.db.insert("userProviderAccounts", {
      ...account,
      userId: strangerId,
      label: "Theirs",
    });
    return { ownerId, taskId, ownAccountId, strangerAccountId };
  });
}

describe("message credential stamp", () => {
  test(
    "a retry on Team clears the old account, so a new limit holds Team",
    async () => {
      const t = convexTest(schema, modules);
      const { ownerId, taskId, ownAccountId } = await seed(t);

      const hold = await t.run(async (ctx) => {
        const now = Date.now();
        const userMessageId = await ctx.db.insert("messages", {
          parentId: taskId,
          role: "user",
          content: "fix the header",
          timestamp: now - 2,
          model: "claude:sonnet" as const,
          ...(await resolveMessageCredential(ctx.db, ownAccountId, ownerId)),
        });
        // Same patch as retryLastTurnWithAccount with the Team pick.
        await ctx.db.patch(userMessageId, {
          ...(await resolveMessageCredential(ctx.db, undefined, ownerId)),
        });
        await ctx.db.insert("messages", {
          parentId: taskId,
          role: "assistant",
          content: "Error: You've hit your session limit",
          timestamp: now - 1,
          finishedAt: now - 1,
          errorType: "rate_limit" as const,
          limitResetAt: now + HOUR_MS,
        });
        const userMessage = await ctx.db.get(userMessageId);
        expect(userMessage?.credentialSourceLabel).toBe("Team");
        expect(userMessage?.credentialAccountId).toBeUndefined();

        const recent = await ctx.db
          .query("messages")
          .withIndex("by_parent", (q) => q.eq("parentId", taskId))
          .order("desc")
          .collect();
        return findUsageLimitHold(recent, now);
      });

      expect(hold?.accountId).toBeNull();
    },
    TIMEOUT_MS,
  );

  test(
    "an account the owner cannot use stamps Team with no account id",
    async () => {
      const t = convexTest(schema, modules);
      const { ownerId, ownAccountId, strangerAccountId } = await seed(t);

      const [own, stranger] = await t.run(async (ctx) =>
        Promise.all([
          resolveMessageCredential(ctx.db, ownAccountId, ownerId),
          resolveMessageCredential(ctx.db, strangerAccountId, ownerId),
        ]),
      );

      expect(own.credentialAccountId).toBe(ownAccountId);
      expect(stranger).toEqual({
        credentialSourceLabel: "Team",
        credentialAccountId: undefined,
      });
    },
    TIMEOUT_MS,
  );
});
